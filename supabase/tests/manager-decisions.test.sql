begin;

select no_plan();

select ok(
  to_regprocedure('public.get_manager_join_requests(uuid)') is not null
  and to_regprocedure('public.get_my_join_requests_v2()') is not null
  and to_regprocedure('public.approve_join_request(uuid)') is not null
  and to_regprocedure('public.reject_join_request(uuid,text)') is not null,
  'manager queue and decision RPCs exist'
);

select ok(
  not has_function_privilege('anon', 'public.get_manager_join_requests(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.approve_join_request(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reject_join_request(uuid,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.get_manager_join_requests(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.approve_join_request(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.reject_join_request(uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_manager_join_requests(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.approve_join_request(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.reject_join_request(uuid,text)', 'EXECUTE'),
  'only authenticated callers can execute manager RPCs'
);

select ok(
  not exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname in (
        'get_manager_join_requests',
        'get_my_join_requests_v2',
        'approve_join_request',
        'reject_join_request'
      )
      and (
        not pg_proc.prosecdef
        or coalesce(array_to_string(pg_proc.proconfig, ','), '') <> 'search_path=""'
      )
  ),
  'manager RPCs are security definer with an empty search_path'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'decision-manager@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"מנהלת החלטות"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a2000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'decision-approved@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"מבקש אישור"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'decision-rejected@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"מבקשת דחייה"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a4000000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'decision-outsider@example.com', crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"מנהלת זרה"}', now(), now());

create function pg_temp.set_actor(p_actor_id uuid)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_actor_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create temp table decision_fixture (
  league_id uuid not null,
  other_league_id uuid not null,
  approve_request_id uuid not null,
  reject_request_id uuid not null
);

do $$
declare
  v_league_id uuid;
  v_other_league_id uuid;
  v_approve_request_id uuid := extensions.gen_random_uuid();
  v_reject_request_id uuid := extensions.gen_random_uuid();
  v_approve_proof_id uuid := extensions.gen_random_uuid();
  v_reject_proof_id uuid := extensions.gen_random_uuid();
begin
  perform pg_temp.set_actor('a1000000-0000-4000-8000-000000000001');
  select public.create_league(
    '26000000-0000-4000-8000-000000000027', 'ליגת החלטות', null, 0, null, null,
    true, 3::smallint, 1::smallint, 0::smallint,
    '[{"position":1,"percentage_bps":10000}]'::jsonb
  ) into v_league_id;

  perform pg_temp.set_actor('a4000000-0000-4000-8000-000000000004');
  select public.create_league(
    '26000000-0000-4000-8000-000000000027', 'ליגת מנהלת זרה', null, 0, null, null,
    true, 3::smallint, 1::smallint, 0::smallint,
    '[{"position":1,"percentage_bps":10000}]'::jsonb
  ) into v_other_league_id;

  insert into public.join_requests (id, league_id, user_id, status)
  values
    (v_approve_request_id, v_league_id, 'a2000000-0000-4000-8000-000000000002', 'pending_approval'),
    (v_reject_request_id, v_league_id, 'a3000000-0000-4000-8000-000000000003', 'pending_approval');

  insert into public.payment_proofs (
    id, join_request_id, uploaded_by, storage_path, mime_type, size_bytes,
    sha256, upload_idempotency_key
  ) values
    (v_approve_proof_id, v_approve_request_id, 'a2000000-0000-4000-8000-000000000002',
     'league/' || v_league_id || '/request/' || v_approve_request_id || '/' || v_approve_proof_id || '.webp',
     'image/webp', 128, repeat('a', 64), extensions.gen_random_uuid()),
    (v_reject_proof_id, v_reject_request_id, 'a3000000-0000-4000-8000-000000000003',
     'league/' || v_league_id || '/request/' || v_reject_request_id || '/' || v_reject_proof_id || '.webp',
     'image/webp', 256, repeat('b', 64), extensions.gen_random_uuid());

  insert into decision_fixture values (
    v_league_id, v_other_league_id, v_approve_request_id, v_reject_request_id
  );
end;
$$;

select pg_temp.set_actor('a1000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::integer from public.get_manager_join_requests(
    (select league_id from decision_fixture)
  )),
  2,
  'the exact manager sees both pending requests'
);
select is(
  (select sum(jsonb_array_length(queue.proofs))::integer
   from public.get_manager_join_requests((select league_id from decision_fixture)) as queue),
  2,
  'the manager queue includes proof summaries'
);
select ok(
  not exists (
    select 1
    from public.get_manager_join_requests((select league_id from decision_fixture)) as queue
    where queue.proofs @? '$[*].storage_path'
  ),
  'proof summaries never disclose private object paths'
);

select pg_temp.set_actor('a4000000-0000-4000-8000-000000000004');
select throws_ok(
  format('select * from public.get_manager_join_requests(%L::uuid)',
    (select league_id from decision_fixture)),
  'P0001', 'FORBIDDEN',
  'another league manager cannot read the queue'
);
select throws_ok(
  format('select * from public.approve_join_request(%L::uuid)',
    (select approve_request_id from decision_fixture)),
  'P0001', 'FORBIDDEN',
  'another league manager cannot approve the request'
);
select throws_ok(
  format('select * from public.reject_join_request(%L::uuid, %L)',
    (select reject_request_id from decision_fixture), 'דחייה לא מורשית'),
  'P0001', 'FORBIDDEN',
  'another league manager cannot reject the request'
);

select pg_temp.set_actor('a2000000-0000-4000-8000-000000000002');
select throws_ok(
  format('select * from public.reject_join_request(%L::uuid, %L)',
    (select reject_request_id from decision_fixture), 'דחייה לא מורשית'),
  'P0001', 'FORBIDDEN',
  'an ordinary authenticated requester cannot reject another request'
);

insert into public.join_requests (id, league_id, user_id, status)
values (
  'a5000000-0000-4000-8000-000000000005',
  (select league_id from decision_fixture),
  'a4000000-0000-4000-8000-000000000004',
  'pending_approval'
);

select pg_temp.set_actor('a1000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select * from public.approve_join_request(
    'a5000000-0000-4000-8000-000000000005'
  )$$,
  'P0001', 'STATE_CONFLICT',
  'approval cannot bypass the proof-backed state invariant'
);
select lives_ok(
  format('select * from public.approve_join_request(%L::uuid)',
    (select approve_request_id from decision_fixture)),
  'the exact manager can approve a proof-backed request'
);
select results_eq(
  $$select request.status::text, member.status::text
    from public.join_requests as request
    join public.league_members as member
      on member.league_id = request.league_id and member.user_id = request.user_id
    where request.id = (select approve_request_id from decision_fixture)$$,
  $$values ('approved'::text, 'active'::text)$$,
  'approval atomically creates active membership and updates request state'
);
select lives_ok(
  format('select * from public.approve_join_request(%L::uuid)',
    (select approve_request_id from decision_fixture)),
  'repeated approval is idempotent'
);
select is(
  (select count(*)::integer from public.audit_logs
   where entity_id = (select approve_request_id from decision_fixture)
     and action = 'join_request.approved'),
  1,
  'repeated approval creates one audit record'
);
select is(
  (select count(*)::integer from public.league_members
   where league_id = (select league_id from decision_fixture)
     and user_id = 'a2000000-0000-4000-8000-000000000002'),
  1,
  'repeated approval creates one membership row'
);

select throws_ok(
  format('select * from public.reject_join_request(%L::uuid, %L)',
    (select reject_request_id from decision_fixture), 'x'),
  'P0001', 'VALIDATION_ERROR',
  'a rejection requires a safe reason'
);
select lives_ok(
  format('select * from public.reject_join_request(%L::uuid, %L)',
    (select reject_request_id from decision_fixture), 'ההוכחה אינה מתאימה להדגמה'),
  'the exact manager can reject with a safe reason'
);
select results_eq(
  $$select status::text, rejection_reason, decided_by::text
    from public.join_requests
    where id = (select reject_request_id from decision_fixture)$$,
  $$values (
    'rejected'::text,
    'ההוכחה אינה מתאימה להדגמה'::text,
    'a1000000-0000-4000-8000-000000000001'::text
  )$$,
  'rejection preserves the reason and manager decision metadata'
);
select lives_ok(
  format('select * from public.reject_join_request(%L::uuid, %L)',
    (select reject_request_id from decision_fixture), 'ההוכחה אינה מתאימה להדגמה'),
  'repeated rejection with the same reason is idempotent'
);
select throws_ok(
  format('select * from public.reject_join_request(%L::uuid, %L)',
    (select reject_request_id from decision_fixture), 'סיבה אחרת'),
  'P0001', 'STATE_CONFLICT',
  'repeated rejection cannot silently replace the recorded reason'
);
select is(
  (select count(*)::integer from public.audit_logs
   where entity_id = (select reject_request_id from decision_fixture)
     and action = 'join_request.rejected'),
  1,
  'repeated rejection creates one audit record'
);
select is(
  (select count(*)::integer from public.league_members
   where league_id = (select league_id from decision_fixture)
     and user_id = 'a3000000-0000-4000-8000-000000000003'),
  0,
  'rejection does not create membership'
);

select throws_ok(
  format('select * from public.approve_join_request(%L::uuid)',
    (select reject_request_id from decision_fixture)),
  'P0001', 'STATE_CONFLICT',
  'an already rejected request cannot be approved by replay or a stale UI'
);
select throws_ok(
  format('select * from public.reject_join_request(%L::uuid, %L)',
    (select approve_request_id from decision_fixture), 'הכרעה סותרת'),
  'P0001', 'STATE_CONFLICT',
  'an already approved request cannot be rejected by replay or a stale UI'
);
select results_eq(
  $$select request.user_id::text, request.status::text,
           count(member.id)::integer
    from public.join_requests as request
    left join public.league_members as member
      on member.league_id = request.league_id
     and member.user_id = request.user_id
    where request.id in (
      (select approve_request_id from decision_fixture),
      (select reject_request_id from decision_fixture)
    )
    group by request.user_id, request.status
    order by request.user_id$$,
  $$values
    ('a2000000-0000-4000-8000-000000000002'::text, 'approved'::text, 1),
    ('a3000000-0000-4000-8000-000000000003'::text, 'rejected'::text, 0)$$,
  'cross-terminal replays preserve one approved membership and no rejected membership'
);

select pg_temp.set_actor('a3000000-0000-4000-8000-000000000003');
select results_eq(
  $$select status::text, rejection_reason
    from public.get_my_join_requests_v2()
    where request_id = (select reject_request_id from decision_fixture)$$,
  $$values ('rejected'::text, 'ההוכחה אינה מתאימה להדגמה'::text)$$,
  'the requester can see the resulting rejection state and safe reason'
);

select * from finish();
rollback;
