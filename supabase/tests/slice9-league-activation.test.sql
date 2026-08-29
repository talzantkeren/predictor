begin;

select no_plan();

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leagues'
      and column_name = 'activated_at'
      and data_type = 'timestamp with time zone'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leagues'::regclass
      and conname = 'leagues_activated_at_check'
      and contype = 'c'
      and convalidated
  ),
  'leagues persist a finite effective activation timestamp'
);

select ok(
  to_regprocedure('public.start_league(uuid)') is not null
  and to_regprocedure('public.activate_due_leagues()') is not null
  and to_regprocedure(
    'private.slice9_activate_league_core(uuid,uuid,text,timestamptz)'
  ) is not null
  and to_regprocedure(
    'private.slice9_activate_due_leagues_core(uuid,timestamptz,interval)'
  ) is not null,
  'manual and scheduled lifecycle activation gateways exist'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_admins'
      and column_name = 'automation_purpose'
      and data_type = 'text'
      and is_nullable = 'YES'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.system_admins'::regclass
      and conname = 'system_admins_automation_purpose_check'
      and contype = 'c'
      and convalidated
  )
  and exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'system_admins'
      and indexname = 'system_admins_automation_purpose_unique_idx'
      and indexdef ilike '%where (automation_purpose is not null)%'
  ),
  'the noninteractive system actor has one constrained unique designation'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.system_admins'::regclass
      and tgname = 'slice9_sync_business_boundary_actor_binding'
      and not tgisinternal
  )
  and (
    select prosecdef and proconfig @> array['search_path=""']
    from pg_proc
    where oid = 'private.slice9_sync_business_boundary_actor_binding()'::regprocedure
  )
  and not has_function_privilege(
    'anon',
    'private.slice9_sync_business_boundary_actor_binding()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.slice9_sync_business_boundary_actor_binding()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'private.slice9_sync_business_boundary_actor_binding()',
    'EXECUTE'
  )
  and not has_column_privilege(
    'anon', 'public.system_admins', 'automation_purpose', 'SELECT,UPDATE'
  )
  and not has_column_privilege(
    'authenticated', 'public.system_admins', 'automation_purpose', 'SELECT,UPDATE'
  )
  and not has_column_privilege(
    'service_role', 'public.system_admins', 'automation_purpose', 'SELECT,UPDATE'
  ),
  'the designation trigger and column have no Data API grant'
);

select ok(
  to_regprocedure('private.slice9_promote_legacy_boundary_binding()') is not null
  and not (
    select prosecdef
    from pg_proc
    where oid = 'private.slice9_promote_legacy_boundary_binding()'::regprocedure
  )
  and (
    select proconfig @> array['search_path=""']
    from pg_proc
    where oid = 'private.slice9_promote_legacy_boundary_binding()'::regprocedure
  )
  and not has_function_privilege(
    'anon', 'private.slice9_promote_legacy_boundary_binding()', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'private.slice9_promote_legacy_boundary_binding()', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'private.slice9_promote_legacy_boundary_binding()', 'EXECUTE'
  ),
  'legacy promotion is an invoker-rights deployment contract with no Data API grant'
);

select ok(
  (
    select bool_and(prosecdef and proconfig @> array['search_path=""'])
    from pg_proc
    where oid in (
      'public.start_league(uuid)'::regprocedure,
      'public.activate_due_leagues()'::regprocedure,
      'private.slice9_activate_league_core(uuid,uuid,text,timestamptz)'::regprocedure,
      'private.slice9_activate_due_leagues_core(uuid,timestamptz,interval)'::regprocedure
    )
  ),
  'all activation functions are security definer with empty search paths'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.start_league(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.start_league(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.start_league(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.activate_due_leagues()', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.activate_due_leagues()', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.activate_due_leagues()', 'EXECUTE'
  ),
  'manual start is session-only and the Cron fallback is service-role only'
);

select ok(
  not has_function_privilege(
    'service_role',
    'private.slice9_activate_league_core(uuid,uuid,text,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.slice9_activate_league_core(uuid,uuid,text,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'private.slice9_activate_due_leagues_core(uuid,timestamptz,interval)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.slice9_activate_due_leagues_core(uuid,timestamptz,interval)',
    'EXECUTE'
  ),
  'explicit-time activation test seams have no Data API execution grant'
);

select ok(
  position(
    'private.slice9_lock_leagues' in
    lower(pg_get_functiondef(
      'public.apply_api_football_sync_batch(uuid,bigint,uuid,jsonb)'::regprocedure
    ))
  ) > 0
  and position(
    'slice9_apply_api_football_sync_batch_with_global_lock' in
    lower(pg_get_functiondef(
      'public.apply_api_football_sync_batch(uuid,bigint,uuid,jsonb)'::regprocedure
    ))
  ) > 0,
  'provider apply bridges every affected league key before fixture writes'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'db000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'activation-manager@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Activation Manager"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'db000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'activation-foreign@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Activation Foreign"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'db000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'activation-admin@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Activation Admin"}', now(), now()
  );

insert into public.system_admins (user_id, granted_by)
values (
  'db000000-0000-4000-8000-000000000003',
  'db000000-0000-4000-8000-000000000003'
);

insert into public.seasons (
  id, competition_id, name, starts_on, ends_on, is_current
)
values
  (
    'db000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000001',
    'Activation On Time', '2026-01-01', '2026-12-31', false
  ),
  (
    'db000000-0000-4000-8000-000000000102',
    '26000000-0000-4000-8000-000000000001',
    'Activation Late', '2026-01-01', '2026-12-31', false
  ),
  (
    'db000000-0000-4000-8000-000000000103',
    '26000000-0000-4000-8000-000000000001',
    'Activation Not Due', '2026-01-01', '2026-12-31', false
  ),
  (
    'db000000-0000-4000-8000-000000000104',
    '26000000-0000-4000-8000-000000000001',
    'Activation Manual', '2099-01-01', '2099-12-31', false
  );

insert into public.leagues (id, manager_id, season_id, name, status)
values
  (
    'db000000-0000-4000-8000-000000000201',
    'db000000-0000-4000-8000-000000000001',
    'db000000-0000-4000-8000-000000000101',
    'Activation On Time League', 'open'
  ),
  (
    'db000000-0000-4000-8000-000000000202',
    'db000000-0000-4000-8000-000000000001',
    'db000000-0000-4000-8000-000000000102',
    'Activation Late League', 'open'
  ),
  (
    'db000000-0000-4000-8000-000000000203',
    'db000000-0000-4000-8000-000000000001',
    'db000000-0000-4000-8000-000000000103',
    'Activation Not Due League', 'open'
  ),
  (
    'db000000-0000-4000-8000-000000000204',
    'db000000-0000-4000-8000-000000000001',
    'db000000-0000-4000-8000-000000000104',
    'Activation Manual League', 'open'
  );

insert into public.league_scoring_rules (league_id)
select id
from public.leagues
where id between
  'db000000-0000-4000-8000-000000000201'
  and 'db000000-0000-4000-8000-000000000204';

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status
)
values
  (
    'db000000-0000-4000-8000-000000000301',
    'db000000-0000-4000-8000-000000000101', 1,
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000102',
    '2026-08-27T12:01:00Z', 'scheduled'
  ),
  (
    'db000000-0000-4000-8000-000000000302',
    'db000000-0000-4000-8000-000000000102', 1,
    '26000000-0000-4000-8000-000000000103',
    '26000000-0000-4000-8000-000000000104',
    '2026-08-27T11:59:59Z', 'scheduled'
  ),
  (
    'db000000-0000-4000-8000-000000000303',
    'db000000-0000-4000-8000-000000000103', 1,
    '26000000-0000-4000-8000-000000000105',
    '26000000-0000-4000-8000-000000000106',
    '2026-08-27T12:03:00Z', 'scheduled'
  ),
  (
    'db000000-0000-4000-8000-000000000304',
    'db000000-0000-4000-8000-000000000104', 1,
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000103',
    '2099-08-27T12:00:00Z', 'scheduled'
  );

insert into public.join_requests (
  id, league_id, user_id, status, created_at, updated_at
) values (
  'db000000-0000-4000-8000-000000000401',
  'db000000-0000-4000-8000-000000000203',
  'db000000-0000-4000-8000-000000000002',
  'pending_approval',
  '2026-08-27T09:00:00Z',
  '2026-08-27T09:00:00Z'
);

insert into public.payment_proofs (
  id, join_request_id, uploaded_by, storage_path, mime_type, size_bytes,
  sha256, upload_idempotency_key, uploaded_at
) values (
  'db000000-0000-4000-8000-000000000501',
  'db000000-0000-4000-8000-000000000401',
  'db000000-0000-4000-8000-000000000002',
  'league/db000000-0000-4000-8000-000000000203/request/db000000-0000-4000-8000-000000000401/db000000-0000-4000-8000-000000000501.webp',
  'image/webp',
  128,
  repeat('d', 64),
  'db000000-0000-4000-8000-000000000601',
  '2026-08-27T09:01:00Z'
);

create temp table activation_due_result as
select *
from private.slice9_activate_due_leagues_core(
  'db000000-0000-4000-8000-000000000003',
  '2026-08-27T12:00:00Z',
  interval '2 minutes'
);

select results_eq(
  $$select activated_count, late_count, recorded_at
    from activation_due_result$$,
  $$values (2, 1, '2026-08-27T12:00:00Z'::timestamptz)$$,
  'the fixed lookahead activates due leagues and counts late recovery separately'
);

select results_eq(
  $$select id, status::text, activated_at
    from public.leagues
    where id between
      'db000000-0000-4000-8000-000000000201'
      and 'db000000-0000-4000-8000-000000000203'
    order by id$$,
  $$values
    ('db000000-0000-4000-8000-000000000201'::uuid, 'active'::text, '2026-08-27T12:00:00Z'::timestamptz),
    ('db000000-0000-4000-8000-000000000202'::uuid, 'active'::text, '2026-08-27T11:59:59Z'::timestamptz),
    ('db000000-0000-4000-8000-000000000203'::uuid, 'open'::text, null::timestamptz)$$,
  'on-time activation uses write time, late recovery uses first kickoff, and not-due stays open'
);

select results_eq(
  $$select entity_id, metadata ->> 'code', created_at,
           (metadata ->> 'recorded_at')::timestamptz,
           (metadata ->> 'activated_at')::timestamptz
    from public.audit_logs
    where action = 'league_activated'
      and entity_id in (
        'db000000-0000-4000-8000-000000000201',
        'db000000-0000-4000-8000-000000000202'
      )
    order by entity_id$$,
  $$values
    ('db000000-0000-4000-8000-000000000201'::uuid, 'ACTIVATION_FALLBACK'::text, '2026-08-27T12:00:00Z'::timestamptz, '2026-08-27T12:00:00Z'::timestamptz, '2026-08-27T12:00:00Z'::timestamptz),
    ('db000000-0000-4000-8000-000000000202'::uuid, 'ACTIVATION_PERSIST_LATE'::text, '2026-08-27T12:00:00Z'::timestamptz, '2026-08-27T12:00:00Z'::timestamptz, '2026-08-27T11:59:59Z'::timestamptz)$$,
  'audit preserves real recorded time and explicitly marks late persistence without backdating'
);

select ok(
  (
    select created_at > (metadata ->> 'activated_at')::timestamptz
    from public.audit_logs
    where action = 'league_activated'
      and entity_id = 'db000000-0000-4000-8000-000000000202'
  ),
  'ACTIVATION_PERSIST_LATE is observable and cannot count as an on-time deadline success'
);

select results_eq(
  $$select league_id, locked_at
    from public.league_scoring_rules
    where league_id in (
      'db000000-0000-4000-8000-000000000201',
      'db000000-0000-4000-8000-000000000202'
    )
    order by league_id$$,
  $$values
    ('db000000-0000-4000-8000-000000000201'::uuid, '2026-08-27T12:00:00Z'::timestamptz),
    ('db000000-0000-4000-8000-000000000202'::uuid, '2026-08-27T11:59:59Z'::timestamptz)$$,
  'activation atomically locks each league scoring rule at its effective boundary'
);

select results_eq(
  $$select activated_count, late_count
    from private.slice9_activate_due_leagues_core(
      'db000000-0000-4000-8000-000000000003',
      '2026-08-27T12:00:30Z',
      interval '2 minutes'
    )$$,
  $$values (0, 0)$$,
  'scheduled activation replay is an idempotent no-op'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where action = 'league_activated'
      and entity_id in (
        'db000000-0000-4000-8000-000000000201',
        'db000000-0000-4000-8000-000000000202'
      )
  ),
  2,
  'scheduled replay does not duplicate activation audit rows'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"db000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.start_league(
    'db000000-0000-4000-8000-000000000204'
  )$$,
  'P0001', 'LEAGUE_NOT_FOUND',
  'a foreign actor receives an opaque denial for manual activation'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"db000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
create temp table activation_manual_result as
select *
from public.start_league('db000000-0000-4000-8000-000000000204');
select results_eq(
  $$select result_status::text, result_code, result_changed
    from activation_manual_result$$,
  $$values ('active'::text, 'MANUAL_ACTIVATION'::text, true)$$,
  'the exact manager can activate an open league early'
);
select results_eq(
  $$select result_status::text, result_code, result_changed
    from public.start_league('db000000-0000-4000-8000-000000000204')$$,
  $$values ('active'::text, 'ALREADY_ACTIVE'::text, false)$$,
  'manual double submit is idempotent'
);
select throws_ok(
  $$select * from public.activate_due_leagues()$$,
  '42501', null,
  'an authenticated manager cannot execute the Cron fallback'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where action = 'league_activated'
      and entity_id = 'db000000-0000-4000-8000-000000000204'
  ),
  1,
  'manual replay writes exactly one activation audit event'
);

select results_eq(
  $$select administrator.user_id, administrator.automation_purpose
    from public.system_admins as administrator
    where administrator.automation_purpose = 'sports_sync'$$,
  $$values (
    '70000000-0000-4000-8000-000000000007'::uuid,
    'sports_sync'::text
  )$$,
  'the local principal is explicitly designated before any Cron call'
);

update public.system_admins
set automation_purpose = null
where user_id = '70000000-0000-4000-8000-000000000007';
insert into private.slice9_system_actor_bindings (
  binding_name,
  actor_id
) values (
  'business_boundary_activation',
  '70000000-0000-4000-8000-000000000007'
);
select results_eq(
  $$select administrator.automation_purpose, binding.actor_id
    from private.slice9_system_actor_bindings as binding
    join public.system_admins as administrator
      on administrator.user_id = binding.actor_id
    where binding.binding_name = 'business_boundary_activation'$$,
  $$values (
    null::text,
    '70000000-0000-4000-8000-000000000007'::uuid
  )$$,
  'the promotion regression starts with a legacy binding and no designation'
);
select is(
  private.slice9_promote_legacy_boundary_binding(),
  true,
  'the deployment contract promotes the legacy binding before traffic'
);
select results_eq(
  $$select administrator.automation_purpose, binding.actor_id
    from private.slice9_system_actor_bindings as binding
    join public.system_admins as administrator
      on administrator.user_id = binding.actor_id
    where binding.binding_name = 'business_boundary_activation'$$,
  $$values (
    'sports_sync'::text,
    '70000000-0000-4000-8000-000000000007'::uuid
  )$$,
  'legacy promotion restores the unique designation and retains the same binding'
);
select is(
  private.slice9_promote_legacy_boundary_binding(),
  true,
  'legacy promotion is idempotent after the designation is established'
);

update private.slice9_system_actor_bindings
set actor_id = 'db000000-0000-4000-8000-000000000003'
where binding_name = 'business_boundary_activation';
select results_eq(
  $$select administrator.user_id, administrator.automation_purpose,
           binding.actor_id
    from public.system_admins as administrator
    cross join private.slice9_system_actor_bindings as binding
    where administrator.automation_purpose = 'sports_sync'
      and binding.binding_name = 'business_boundary_activation'$$,
  $$values (
    '70000000-0000-4000-8000-000000000007'::uuid,
    'sports_sync'::text,
    'db000000-0000-4000-8000-000000000003'::uuid
  )$$,
  'the mismatch regression starts with distinct designated and legacy-bound actors'
);
select throws_ok(
  $$select private.slice9_promote_legacy_boundary_binding()$$,
  'P0001', 'SYSTEM_ACTOR_MISMATCH',
  'legacy promotion fails closed instead of replacing a distinct designation'
);
select results_eq(
  $$select administrator.user_id, administrator.automation_purpose,
           binding.actor_id
    from public.system_admins as administrator
    cross join private.slice9_system_actor_bindings as binding
    where administrator.automation_purpose = 'sports_sync'
      and binding.binding_name = 'business_boundary_activation'$$,
  $$values (
    '70000000-0000-4000-8000-000000000007'::uuid,
    'sports_sync'::text,
    'db000000-0000-4000-8000-000000000003'::uuid
  )$$,
  'a rejected legacy mismatch preserves both actors for explicit operator repair'
);
update private.slice9_system_actor_bindings
set actor_id = '70000000-0000-4000-8000-000000000007'
where binding_name = 'business_boundary_activation';

delete from private.slice9_system_actor_bindings
where binding_name = 'business_boundary_activation';
select is(
  (
    select count(*)::integer
    from private.slice9_system_actor_bindings
    where binding_name = 'business_boundary_activation'
  ),
  0,
  'the late-approval regression starts from the legacy UNBOUND state'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"db000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
create temp table activation_unbound_approval_result as
select request_status::text, member_status::text
from public.approve_join_request(
  'db000000-0000-4000-8000-000000000401'
);
reset role;

select results_eq(
  $$select request_status, member_status
    from activation_unbound_approval_result$$,
  $$values ('approved'::text, 'active'::text)$$,
  'late approval succeeds before the first Cron binding write'
);
select results_eq(
  $$select league.status::text,
           league.activated_at = match.kickoff_at,
           audit.actor_id,
           audit.metadata ->> 'triggering_actor_id'
    from public.leagues as league
    join public.matches as match
      on match.id = 'db000000-0000-4000-8000-000000000303'
    join public.audit_logs as audit
      on audit.entity_id = league.id
     and audit.action = 'league_activated'
    where league.id = 'db000000-0000-4000-8000-000000000203'$$,
  $$values (
    'active'::text,
    true,
    '70000000-0000-4000-8000-000000000007'::uuid,
    'db000000-0000-4000-8000-000000000001'::text
  )$$,
  'UNBOUND recovery uses the designated system actor and records the manager only as trigger provenance'
);
select is(
  (
    select count(*)::integer
    from private.slice9_system_actor_bindings
    where binding_name = 'business_boundary_activation'
  ),
  0,
  'the league-first fallback remains read-only and cannot invert the lock order'
);

set local role service_role;
select set_config('request.headers', '{}', true);
select throws_ok(
  $$select * from public.activate_due_leagues()$$,
  'P0001', 'FORBIDDEN',
  'the Cron fallback rejects a missing fixed system actor'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"db000000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$select * from public.activate_due_leagues()$$,
  'P0001', 'FORBIDDEN',
  'the Cron fallback rejects an ordinary fixed actor'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select lives_ok(
  $$select * from public.activate_due_leagues()$$,
  'the existing-Cron gateway accepts the fixed system actor without provider input'
);
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"db000000-0000-4000-8000-000000000003"}',
  true
);
select throws_ok(
  $$select * from public.activate_due_leagues()$$,
  'P0001', 'SYSTEM_ACTOR_MISMATCH',
  'a different system administrator cannot silently replace the bound automation actor'
);
reset role;

select results_eq(
  $$select binding.actor_id
    from private.slice9_system_actor_bindings as binding
    where binding.binding_name = 'business_boundary_activation'$$,
  $$values ('70000000-0000-4000-8000-000000000007'::uuid)$$,
  'the Cron gateway retains the configured noninteractive actor after a mismatched call'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'private.slice9_system_actor_bindings',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'service_role',
    'private.slice9_system_actor_bindings',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'Data API roles have no direct access to the private actor binding'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.slice9_business_boundary_system_actor()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'private.slice9_business_boundary_system_actor()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.slice9_bind_business_boundary_system_actor(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'private.slice9_bind_business_boundary_system_actor(uuid)',
    'EXECUTE'
  ),
  'the private actor-binding helpers have no Data API grants'
);

delete from public.system_admins
where user_id = '70000000-0000-4000-8000-000000000007';
select is(
  (
    select count(*)::integer
    from private.slice9_system_actor_bindings
    where binding_name = 'business_boundary_activation'
  ),
  0,
  'revoking the configured system administrator removes its boundary binding'
);
select throws_ok(
  $$select private.slice9_business_boundary_system_actor()$$,
  'P0001', 'SYSTEM_ACTOR_UNAVAILABLE',
  'an ordinary system administrator is never guessed when the designation is absent'
);
update public.system_admins
set automation_purpose = 'sports_sync'
where user_id = 'db000000-0000-4000-8000-000000000003';
select results_eq(
  $$select binding.actor_id
    from private.slice9_system_actor_bindings as binding
    where binding.binding_name = 'business_boundary_activation'$$,
  $$values ('db000000-0000-4000-8000-000000000003'::uuid)$$,
  'controlled rotation designates and binds the replacement before traffic'
);
set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"db000000-0000-4000-8000-000000000003"}',
  true
);
select lives_ok(
  $$select * from public.activate_due_leagues()$$,
  'the next valid Cron call verifies the explicitly rotated system actor'
);
reset role;
select results_eq(
  $$select binding.actor_id
    from private.slice9_system_actor_bindings as binding
    where binding.binding_name = 'business_boundary_activation'$$,
  $$values ('db000000-0000-4000-8000-000000000003'::uuid)$$,
  'system-actor rotation is explicit and observable after revocation'
);

select * from finish();
rollback;
