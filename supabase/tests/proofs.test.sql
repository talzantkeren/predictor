begin;

select no_plan();

-- ===== Private bucket and proof schema contracts =====

select results_eq(
  $$select id, name, public, file_size_limit::integer, allowed_mime_types
    from storage.buckets where id = 'payment-proofs'$$,
  $$values (
    'payment-proofs'::text,
    'payment-proofs'::text,
    false,
    4000000,
    array['image/webp']::text[]
  )$$,
  'payment-proofs bucket is private and accepts only sanitized WebP output'
);

select is(
  (select count(*)::integer
   from pg_policy
   where polrelid = 'storage.objects'::regclass),
  0,
  'Slice 3 creates no direct storage.objects policies'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_proofs'::regclass
      and conname = 'payment_proofs_request_idempotency_key'
      and contype = 'u'
  ),
  'proof idempotency is backed by a database unique constraint'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_proofs'::regclass
      and conname = 'payment_proofs_mime_type_check'
      and contype = 'c'
  )
  and exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_proofs'::regclass
      and conname = 'payment_proofs_size_bytes_check'
      and contype = 'c'
  )
  and exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_proofs'::regclass
      and conname = 'payment_proofs_sha256_check'
      and contype = 'c'
  ),
  'proof MIME, size, and digest checks exist'
);

select ok(
  not has_table_privilege('authenticated', 'public.payment_proofs', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.payment_proofs', 'SELECT,INSERT,UPDATE,DELETE'),
  'proof metadata cannot be mutated directly by browser roles'
);
select ok(
  not has_table_privilege('authenticated', 'public.rate_limit_events', 'SELECT,INSERT,UPDATE,DELETE'),
  'rate-limit events cannot be read or forged directly'
);

-- ===== Test actors and stack-local invite orchestration =====

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '61000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'proof-manager-a@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"מנהלת הוכחות א"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '62000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'proof-requester-b@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"מעלה הוכחה ב"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '63000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'proof-requester-c@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"מעלה הוכחה ג"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '64000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'proof-manager-d@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"מנהל הוכחות ד"}'::jsonb, now(), now()
  );

create function pg_temp.set_proof_actor(p_actor_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_actor_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create function pg_temp.create_proof_league(
  p_manager_id uuid,
  p_name text
)
returns uuid
language plpgsql
as $$
declare
  v_league_id uuid;
begin
  perform pg_temp.set_proof_actor(p_manager_id);
  select public.create_league(
    '26000000-0000-4000-8000-000000000027',
    p_name,
    null,
    0,
    null,
    null::timestamptz,
    true,
    3::smallint,
    1::smallint,
    0::smallint,
    '[{"position":1,"percentage_bps":10000}]'::jsonb
  ) into v_league_id;
  return v_league_id;
end;
$$;

create function pg_temp.create_proof_request(
  p_manager_id uuid,
  p_requester_id uuid,
  p_league_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_public_id uuid;
  v_raw_token text;
  v_request_id uuid;
begin
  perform pg_temp.set_proof_actor(p_manager_id);
  select created.public_id, created.raw_token
    into v_public_id, v_raw_token
  from public.create_or_rotate_invite(p_league_id) as created;
  perform pg_temp.set_proof_actor(p_requester_id);
  select submitted.request_id into v_request_id
  from public.submit_join_request(
    v_public_id,
    encode(
      extensions.digest(convert_to(v_raw_token, 'UTF8'), 'sha256'),
      'hex'
    )
  ) as submitted;
  return v_request_id;
end;
$$;

create function pg_temp.insert_proof_object(
  p_league_id uuid,
  p_request_id uuid,
  p_proof_id uuid,
  p_size_bytes integer,
  p_mime_type text default 'image/webp'
)
returns void
language plpgsql
as $$
begin
  insert into storage.objects (bucket_id, name, metadata)
  values (
    'payment-proofs',
    format(
      'league/%s/request/%s/%s.webp',
      p_league_id,
      p_request_id,
      p_proof_id
    ),
    jsonb_build_object('mimetype', p_mime_type, 'size', p_size_bytes)
  );
end;
$$;

create temp table proof_test_context (
  label text primary key,
  league_id uuid not null,
  request_id uuid
);

insert into proof_test_context (label, league_id)
values
  (
    'league-a',
    pg_temp.create_proof_league(
      '61000000-0000-4000-8000-000000000001',
      'ליגת הוכחות פרטית א'
    )
  ),
  (
    'league-d',
    pg_temp.create_proof_league(
      '64000000-0000-4000-8000-000000000004',
      'ליגת הוכחות פרטית ד'
    )
  );

update proof_test_context
set request_id = pg_temp.create_proof_request(
  '61000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000002',
  league_id
)
where label = 'league-a';

insert into proof_test_context (label, league_id, request_id)
select
  'request-c',
  league_id,
  pg_temp.create_proof_request(
    '61000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000003',
    league_id
  )
from proof_test_context
where label = 'league-a';

select throws_ok(
  $$insert into public.payment_proofs (
      id,
      join_request_id,
      uploaded_by,
      storage_path,
      mime_type,
      size_bytes,
      sha256,
      upload_idempotency_key
    )
    select
      '8d000000-0000-4000-8000-000000000001',
      context.request_id,
      '62000000-0000-4000-8000-000000000002',
      'attacker-controlled.webp',
      'image/webp',
      1,
      repeat('a', 64),
      '9d000000-0000-4000-8000-000000000001'
    from proof_test_context as context
    where context.label = 'league-a'$$,
  '23514', null,
  'proof metadata rejects a path outside the server-derived hierarchy'
);

select throws_ok(
  $$insert into public.payment_proofs (
      id,
      join_request_id,
      uploaded_by,
      storage_path,
      mime_type,
      size_bytes,
      sha256,
      upload_idempotency_key
    )
    select
      '8d000000-0000-4000-8000-000000000002',
      context.request_id,
      '62000000-0000-4000-8000-000000000002',
      format(
        'league/%s/request/%s/8d000000-0000-4000-8000-000000000002.webp',
        context.league_id,
        context.request_id
      ),
      'image/png',
      1,
      repeat('b', 64),
      '9d000000-0000-4000-8000-000000000002'
    from proof_test_context as context
    where context.label = 'league-a'$$,
  '23514', null,
  'proof metadata accepts only sanitized WebP MIME'
);

select throws_ok(
  $$insert into public.payment_proofs (
      id,
      join_request_id,
      uploaded_by,
      storage_path,
      mime_type,
      size_bytes,
      sha256,
      upload_idempotency_key
    )
    select
      '8d000000-0000-4000-8000-000000000003',
      context.request_id,
      '62000000-0000-4000-8000-000000000002',
      format(
        'league/%s/request/%s/8d000000-0000-4000-8000-000000000003.webp',
        context.league_id,
        context.request_id
      ),
      'image/webp',
      0,
      repeat('c', 64),
      '9d000000-0000-4000-8000-000000000003'
    from proof_test_context as context
    where context.label = 'league-a'$$,
  '23514', null,
  'proof metadata enforces the non-empty sanitized size range'
);

select throws_ok(
  $$insert into public.payment_proofs (
      id,
      join_request_id,
      uploaded_by,
      storage_path,
      mime_type,
      size_bytes,
      sha256,
      upload_idempotency_key
    )
    select
      '8d000000-0000-4000-8000-000000000004',
      context.request_id,
      '62000000-0000-4000-8000-000000000002',
      format(
        'league/%s/request/%s/8d000000-0000-4000-8000-000000000004.webp',
        context.league_id,
        context.request_id
      ),
      'image/webp',
      1,
      repeat('G', 64),
      '9d000000-0000-4000-8000-000000000004'
    from proof_test_context as context
    where context.label = 'league-a'$$,
  '23514', null,
  'proof metadata requires a canonical lowercase SHA-256 digest'
);

select throws_ok(
  $$with event_time as (
      select clock_timestamp() as value
    )
    insert into public.payment_proofs (
      id,
      join_request_id,
      uploaded_by,
      storage_path,
      mime_type,
      size_bytes,
      sha256,
      upload_idempotency_key,
      uploaded_at,
      deleted_at
    )
    select
      '8d000000-0000-4000-8000-000000000005',
      context.request_id,
      '62000000-0000-4000-8000-000000000002',
      format(
        'league/%s/request/%s/8d000000-0000-4000-8000-000000000005.webp',
        context.league_id,
        context.request_id
      ),
      'image/webp',
      1,
      repeat('d', 64),
      '9d000000-0000-4000-8000-000000000005',
      event_time.value,
      event_time.value - interval '1 second'
    from proof_test_context as context
    cross join event_time
    where context.label = 'league-a'$$,
  '23514', null,
  'proof deletion timestamps cannot predate upload'
);

-- ===== Upload context and durable rate limiting =====

select pg_temp.set_proof_actor('62000000-0000-4000-8000-000000000002');
select results_eq(
  $$select request_id, league_id, status::text
    from public.get_join_request_upload_context(
      (select request_id from proof_test_context where label = 'league-a')
    )$$,
  $$select request_id, league_id, 'pending_proof'::text
    from proof_test_context where label = 'league-a'$$,
  'request owner receives the trusted upload context'
);

select pg_temp.set_proof_actor('61000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select * from public.get_join_request_upload_context(
    (select request_id from proof_test_context where label = 'league-a')
  )$$,
  'P0001', 'FORBIDDEN',
  'league manager cannot upload on behalf of the requester'
);

select pg_temp.set_proof_actor('64000000-0000-4000-8000-000000000004');
select throws_ok(
  $$select * from public.get_join_request_upload_context(
    (select request_id from proof_test_context where label = 'league-a')
  )$$,
  'P0001', 'FORBIDDEN',
  'another league manager cannot obtain an upload context'
);

select pg_temp.set_proof_actor('62000000-0000-4000-8000-000000000002');
create temp table proof_rate_results (
  allowed boolean,
  retry_after_seconds integer
);
insert into proof_rate_results
select * from public.consume_proof_upload_rate_limit(
  (select request_id from proof_test_context where label = 'league-a')
);
insert into proof_rate_results
select * from public.consume_proof_upload_rate_limit(
  (select request_id from proof_test_context where label = 'league-a')
);
insert into proof_rate_results
select * from public.consume_proof_upload_rate_limit(
  (select request_id from proof_test_context where label = 'league-a')
);
insert into proof_rate_results
select * from public.consume_proof_upload_rate_limit(
  (select request_id from proof_test_context where label = 'league-a')
);
insert into proof_rate_results
select * from public.consume_proof_upload_rate_limit(
  (select request_id from proof_test_context where label = 'league-a')
);

select is(
  (select count(*)::integer from proof_rate_results where allowed),
  5,
  'the first five attempts in fifteen minutes are allowed'
);
select results_eq(
  $$select allowed, retry_after_seconds > 0
    from public.consume_proof_upload_rate_limit(
      (select request_id from proof_test_context where label = 'league-a')
    )$$,
  $$values (false, true)$$,
  'the sixth attempt is denied with a positive Retry-After hint'
);
select is(
  (select count(*)::integer
   from public.rate_limit_events
   where user_id = '62000000-0000-4000-8000-000000000002'),
  5,
  'a denied rate-limit check does not append another event'
);

update public.rate_limit_events
set created_at = now() - interval '15 minutes'
where user_id = '62000000-0000-4000-8000-000000000002';

select results_eq(
  $$select allowed, retry_after_seconds
    from public.consume_proof_upload_rate_limit(
      (select request_id from proof_test_context where label = 'league-a')
    )$$,
  $$values (true, 0)$$,
  'an event exactly at the fifteen-minute boundary no longer consumes quota'
);

insert into public.rate_limit_events (user_id, join_request_id, created_at)
select
  '63000000-0000-4000-8000-000000000003',
  request_id,
  now() - interval '1 hour'
from proof_test_context
cross join generate_series(1, 20)
where label = 'request-c';

select pg_temp.set_proof_actor('63000000-0000-4000-8000-000000000003');
select results_eq(
  $$select allowed, retry_after_seconds > 0
    from public.consume_proof_upload_rate_limit(
      (select request_id from proof_test_context where label = 'request-c')
    )$$,
  $$values (false, true)$$,
  'twenty attempts in twenty-four hours deny another attempt'
);

select pg_temp.set_proof_actor('64000000-0000-4000-8000-000000000004');
select throws_ok(
  $$select * from public.consume_proof_upload_rate_limit(
    (select request_id from proof_test_context where label = 'league-a')
  )$$,
  'P0001', 'FORBIDDEN',
  'a direct caller cannot consume another requester quota'
);

create function pg_temp.stale_rate_window_facts()
returns table (
  stale_transaction_modeled boolean,
  allowed boolean,
  total_event_count integer,
  fresh_window_event_count integer
)
language plpgsql
as $$
declare
  v_actor_id constant uuid := '63000000-0000-4000-8000-000000000003';
  v_request_id uuid;
  v_boundary timestamptz;
  v_allowed boolean;
begin
  select context.request_id
    into v_request_id
    from proof_test_context as context
    where context.label = 'request-c';

  delete from public.rate_limit_events where user_id = v_actor_id;
  v_boundary := clock_timestamp() + interval '30 milliseconds';
  insert into public.rate_limit_events (
    user_id,
    join_request_id,
    action,
    created_at
  )
  select
    v_actor_id,
    v_request_id,
    'proof_upload',
    v_boundary - interval '15 minutes'
  from generate_series(1, 5);

  perform pg_sleep(0.05);
  perform pg_temp.set_proof_actor(v_actor_id);
  select consumed.allowed
    into v_allowed
  from public.consume_proof_upload_rate_limit(v_request_id) as consumed;

  return query
  select
    now() < v_boundary and clock_timestamp() >= v_boundary,
    v_allowed,
    (select count(*)::integer
     from public.rate_limit_events as event
     where event.user_id = v_actor_id),
    (select count(*)::integer
     from public.rate_limit_events as event
     where event.user_id = v_actor_id
       and event.created_at > clock_timestamp() - interval '15 minutes');
end;
$$;

select results_eq(
  $$select * from pg_temp.stale_rate_window_facts()$$,
  $$values (true, true, 6, 1)$$,
  'rate limiting uses a fresh post-lock DB time for window checks and events'
);

-- ===== Atomic finalization, history, idempotency, and authorization =====

select pg_temp.insert_proof_object(
  (select league_id from proof_test_context where label = 'league-a'),
  (select request_id from proof_test_context where label = 'league-a'),
  '81000000-0000-4000-8000-000000000001',
  1234
);

select pg_temp.set_proof_actor('63000000-0000-4000-8000-000000000003');
select throws_ok(
  $$select * from public.finalize_payment_proof(
      (select request_id from proof_test_context where label = 'league-a'),
      '81000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      repeat('a', 64),
      1234
    )$$,
  'P0001', 'FORBIDDEN',
  'another requester cannot finalize an object for a foreign request'
);

select pg_temp.set_proof_actor('61000000-0000-4000-8000-000000000001');
select throws_ok(
  $$select * from public.finalize_payment_proof(
      (select request_id from proof_test_context where label = 'league-a'),
      '81000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      repeat('a', 64),
      1234
    )$$,
  'P0001', 'FORBIDDEN',
  'the league manager cannot bypass the owner-only upload finalizer'
);

select is(
  (select count(*)::integer
   from public.payment_proofs
   where id = '81000000-0000-4000-8000-000000000001'),
  0,
  'hostile finalizer calls create no proof metadata'
);
select is(
  (select request.status::text
   from public.join_requests as request
   where request.id = (
     select request_id from proof_test_context where label = 'league-a'
   )),
  'pending_proof',
  'hostile finalizer calls leave the request state unchanged'
);

select pg_temp.set_proof_actor('62000000-0000-4000-8000-000000000002');
create temp table first_proof_result as
select *
from public.finalize_payment_proof(
  (select request_id from proof_test_context where label = 'league-a'),
  '81000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  repeat('a', 64),
  1234
);

select results_eq(
  $$select proof_id, request_id, status::text, replayed
    from first_proof_result$$,
  $$select
      '81000000-0000-4000-8000-000000000001'::uuid,
      request_id,
      'pending_approval'::text,
      false
    from proof_test_context where label = 'league-a'$$,
  'first valid object finalizes one proof and transitions the request atomically'
);
select is(
  (select status::text from public.join_requests
   where id = (select request_id from proof_test_context where label = 'league-a')),
  'pending_approval',
  'request state is pending_approval after finalization'
);
select ok(
  (
    select proof.uploaded_at > now()
      and request.updated_at >= proof.uploaded_at
      and audit.created_at = proof.uploaded_at
    from public.payment_proofs as proof
    join public.join_requests as request
      on request.id = proof.join_request_id
    join public.audit_logs as audit
      on audit.entity_id = proof.id
     and audit.action = 'payment_proof.created'
    where proof.id = '81000000-0000-4000-8000-000000000001'
  ),
  'proof, request, and audit use fresh ordered DB times after request locking'
);
select is(
  (select storage_path from public.payment_proofs
   where id = '81000000-0000-4000-8000-000000000001'),
  format(
    'league/%s/request/%s/81000000-0000-4000-8000-000000000001.webp',
    (select league_id from proof_test_context where label = 'league-a'),
    (select request_id from proof_test_context where label = 'league-a')
  ),
  'finalizer derives the immutable storage path from trusted relations and proof ID'
);
select ok(
  not exists (
    select 1
    from public.audit_logs
    where entity_id = '81000000-0000-4000-8000-000000000001'
      and (
        metadata::text like '%payment-proofs%'
        or metadata::text like '%webp%'
        or metadata::text like '%' || repeat('a', 64) || '%'
      )
  ),
  'proof audit event contains no path, MIME filename, or digest'
);

select pg_temp.set_proof_actor('62000000-0000-4000-8000-000000000002');
select results_eq(
  $$select proof_id, request_id, status::text, replayed
    from public.finalize_payment_proof(
      (select request_id from proof_test_context where label = 'league-a'),
      '81000000-0000-4000-8000-000000000099',
      '91000000-0000-4000-8000-000000000001',
      repeat('a', 64),
      1234
    )$$,
  $$select
      '81000000-0000-4000-8000-000000000001'::uuid,
      request_id,
      'pending_approval'::text,
      true
    from proof_test_context where label = 'league-a'$$,
  'same idempotency key and content replays the original proof result'
);
select is(
  (select count(*)::integer from public.payment_proofs
   where join_request_id = (select request_id from proof_test_context where label = 'league-a')),
  1,
  'idempotent replay appends no duplicate proof history'
);
select throws_ok(
  $$select * from public.finalize_payment_proof(
    (select request_id from proof_test_context where label = 'league-a'),
    '81000000-0000-4000-8000-000000000099',
    '91000000-0000-4000-8000-000000000001',
    repeat('b', 64),
    1234
  )$$,
  'P0001', 'PROOF_IDEMPOTENCY_CONFLICT',
  'same idempotency key with different content is a stable conflict'
);

select pg_temp.set_proof_actor('63000000-0000-4000-8000-000000000003');
select throws_ok(
  $$select * from public.finalize_payment_proof(
    (select request_id from proof_test_context where label = 'request-c'),
    '82000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    repeat('c', 64),
    2222
  )$$,
  'P0001', 'PROOF_OBJECT_MISSING',
  'metadata finalization requires the exact server-created private object'
);
select is(
  (select status::text from public.join_requests
   where id = (select request_id from proof_test_context where label = 'request-c')),
  'pending_proof',
  'failed object verification leaves the request in pending_proof'
);
select is(
  (select count(*)::integer from public.payment_proofs
   where join_request_id = (select request_id from proof_test_context where label = 'request-c')),
  0,
  'failed object verification inserts no proof metadata'
);

-- Add four intentional replacements. Each uses a new immutable object and key.
select pg_temp.insert_proof_object(
  (select league_id from proof_test_context where label = 'league-a'),
  (select request_id from proof_test_context where label = 'league-a'),
  '81000000-0000-4000-8000-000000000002',
  1400
);
select pg_temp.set_proof_actor('62000000-0000-4000-8000-000000000002');
select * from public.finalize_payment_proof(
  (select request_id from proof_test_context where label = 'league-a'),
  '81000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000002',
  repeat('b', 64),
  1400
);

select pg_temp.insert_proof_object(
  (select league_id from proof_test_context where label = 'league-a'),
  (select request_id from proof_test_context where label = 'league-a'),
  '81000000-0000-4000-8000-000000000003',
  1500
);
select * from public.finalize_payment_proof(
  (select request_id from proof_test_context where label = 'league-a'),
  '81000000-0000-4000-8000-000000000003',
  '91000000-0000-4000-8000-000000000003',
  repeat('c', 64),
  1500
);

select pg_temp.insert_proof_object(
  (select league_id from proof_test_context where label = 'league-a'),
  (select request_id from proof_test_context where label = 'league-a'),
  '81000000-0000-4000-8000-000000000004',
  1600
);
select * from public.finalize_payment_proof(
  (select request_id from proof_test_context where label = 'league-a'),
  '81000000-0000-4000-8000-000000000004',
  '91000000-0000-4000-8000-000000000004',
  repeat('d', 64),
  1600
);

select pg_temp.insert_proof_object(
  (select league_id from proof_test_context where label = 'league-a'),
  (select request_id from proof_test_context where label = 'league-a'),
  '81000000-0000-4000-8000-000000000005',
  1700
);
select * from public.finalize_payment_proof(
  (select request_id from proof_test_context where label = 'league-a'),
  '81000000-0000-4000-8000-000000000005',
  '91000000-0000-4000-8000-000000000005',
  repeat('e', 64),
  1700
);

select is(
  (select count(*)::integer from public.payment_proofs
   where join_request_id = (select request_id from proof_test_context where label = 'league-a')),
  5,
  'five intentional proof records are preserved as history'
);

update public.payment_proofs
set deleted_at = clock_timestamp()
where id = '81000000-0000-4000-8000-000000000001';

select pg_temp.insert_proof_object(
  (select league_id from proof_test_context where label = 'league-a'),
  (select request_id from proof_test_context where label = 'league-a'),
  '81000000-0000-4000-8000-000000000006',
  1800
);
select throws_ok(
  $$select * from public.finalize_payment_proof(
    (select request_id from proof_test_context where label = 'league-a'),
    '81000000-0000-4000-8000-000000000006',
    '91000000-0000-4000-8000-000000000006',
    repeat('f', 64),
    1800
  )$$,
  'P0001', 'PROOF_LIMIT_REACHED',
  'proof quota counts completed history even after logical deletion'
);

select pg_temp.set_proof_actor('62000000-0000-4000-8000-000000000002');
select is(
  (select proofs -> 0 ->> 'id'
   from public.get_my_join_requests_page()
   where request_id = (select request_id from proof_test_context where label = 'league-a')),
  '81000000-0000-4000-8000-000000000005',
  'safe proof history uses uploaded_at DESC then id DESC and omits deleted rows'
);

select results_eq(
  $$select proof_id, request_id, league_id
    from public.authorize_payment_proof_access(
      '81000000-0000-4000-8000-000000000005'
    )$$,
  $$select
      '81000000-0000-4000-8000-000000000005'::uuid,
      request_id,
      league_id
    from proof_test_context where label = 'league-a'$$,
  'proof owner receives a safe authorization projection without a path'
);

select pg_temp.set_proof_actor('61000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::integer
   from public.authorize_payment_proof_access(
     '81000000-0000-4000-8000-000000000005'
   )),
  1,
  'the exact league manager is authorized for proof access'
);

select pg_temp.set_proof_actor('64000000-0000-4000-8000-000000000004');
select is(
  (select count(*)::integer
   from public.authorize_payment_proof_access(
     '81000000-0000-4000-8000-000000000005'
   )),
  0,
  'another league manager receives the same empty authorization result as missing data'
);

select pg_temp.set_proof_actor('63000000-0000-4000-8000-000000000003');
select is(
  (select count(*)::integer
   from public.authorize_payment_proof_access(
     '81000000-0000-4000-8000-000000000005'
   )),
  0,
  'an ordinary outsider receives opaque denial for another requester proof'
);

select pg_temp.set_proof_actor('62000000-0000-4000-8000-000000000002');
select is(
  (select count(*)::integer
   from public.authorize_payment_proof_access(
     '81000000-0000-4000-8000-000000000001'
   )),
  0,
  'a logically deleted proof is not authorizable'
);

-- ===== Direct Data API / Storage-style hostile access =====

create temp table proof_storage_count_before_hostile_delete as
select
  count(*)::integer as object_count,
  coalesce(
    md5(string_agg(row_to_json(object)::text, E'\n' order by object.id)),
    md5('')
  ) as object_fingerprint
from storage.objects as object
where object.bucket_id = 'payment-proofs';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(id)::integer from public.payment_proofs
   where id = '81000000-0000-4000-8000-000000000005'),
  1,
  'proof owner can select the granted safe columns under table RLS'
);
select is(
  (select count(id)::integer from public.payment_proofs
   where id = '81000000-0000-4000-8000-000000000001'),
  0,
  'proof table RLS hides logically deleted metadata from its owner'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select count(id)::integer from public.payment_proofs
   where id = '81000000-0000-4000-8000-000000000005'),
  1,
  'exact league manager can select safe proof columns under table RLS'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"63000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select is(
  (select count(id)::integer from public.payment_proofs
   where id = '81000000-0000-4000-8000-000000000005'),
  0,
  'another requester cannot select safe columns for someone else proof'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"64000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
select is(
  (select count(id)::integer from public.payment_proofs
   where id = '81000000-0000-4000-8000-000000000005'),
  0,
  'another league manager cannot select safe proof columns'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"62000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'payment-proofs'),
  0,
  'authenticated cannot list or directly download private proof objects'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values (
      'payment-proofs',
      'league/00000000-0000-4000-8000-000000000000/request/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000000.webp',
      '{"mimetype":"image/webp","size":1}'::jsonb
    )$$,
  '42501', null,
  'authenticated cannot bypass validation with a direct Storage insert'
);
select lives_ok(
  $$update storage.objects
    set metadata = metadata
    where bucket_id = 'payment-proofs'$$,
  'authenticated direct update is safely filtered by Storage RLS'
);
select lives_ok(
  $$update storage.objects
    set name = name || '.moved'
    where bucket_id = 'payment-proofs'$$,
  'authenticated direct move is safely filtered by Storage RLS'
);
select throws_ok(
  $$delete from storage.objects where bucket_id = 'payment-proofs'$$,
  '42501', null,
  'authenticated cannot directly delete private proof objects'
);
reset role;
select is(
  (select count(*)::integer
   from storage.objects
   where bucket_id = 'payment-proofs'),
  (select object_count from proof_storage_count_before_hostile_delete),
  'authenticated direct delete removes no private proof objects'
);
select is(
  (select coalesce(
      md5(string_agg(row_to_json(object)::text, E'\n' order by object.id)),
      md5('')
    )
   from storage.objects as object
   where object.bucket_id = 'payment-proofs'),
  (select object_fingerprint from proof_storage_count_before_hostile_delete),
  'authenticated direct update, move, and delete leave object rows unchanged'
);
set local role authenticated;
select throws_ok(
  $$select storage_path from public.payment_proofs$$,
  '42501', null,
  'authenticated cannot read internal proof paths'
);
select throws_ok(
  $$insert into public.payment_proofs (
      id, join_request_id, uploaded_by, storage_path, size_bytes, sha256,
      upload_idempotency_key
    ) values (
      '8f000000-0000-4000-8000-000000000001',
      '8f000000-0000-4000-8000-000000000002',
      '62000000-0000-4000-8000-000000000002',
      'forged.webp',
      1,
      repeat('a', 64),
      '9f000000-0000-4000-8000-000000000001'
    )$$,
  '42501', null,
  'authenticated cannot forge proof metadata directly'
);
select throws_ok(
  $$update public.payment_proofs set size_bytes = size_bytes$$,
  '42501', null,
  'authenticated cannot directly update proof metadata'
);
select throws_ok(
  $$delete from public.payment_proofs$$,
  '42501', null,
  'authenticated cannot directly delete proof metadata or history'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'payment-proofs'),
  0,
  'anonymous users cannot list or download proof objects'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('payment-proofs', 'anonymous.webp', '{"mimetype":"image/webp","size":1}'::jsonb)$$,
  '42501', null,
  'anonymous users cannot upload to the private bucket'
);
select lives_ok(
  $$update storage.objects
    set name = name || '.anonymous-move'
    where bucket_id = 'payment-proofs'$$,
  'anonymous direct update or move is safely filtered by Storage RLS'
);
select throws_ok(
  $$delete from storage.objects where bucket_id = 'payment-proofs'$$,
  '42501', null,
  'anonymous users cannot delete private proof objects'
);
reset role;
select is(
  (select count(*)::integer
   from storage.objects
   where bucket_id = 'payment-proofs'),
  (select object_count from proof_storage_count_before_hostile_delete),
  'anonymous direct mutations leave all private proof objects unchanged'
);
select is(
  (select coalesce(
      md5(string_agg(row_to_json(object)::text, E'\n' order by object.id)),
      md5('')
    )
   from storage.objects as object
   where object.bucket_id = 'payment-proofs'),
  (select object_fingerprint from proof_storage_count_before_hostile_delete),
  'anonymous direct update and delete preserve every object row'
);

select * from finish();
rollback;
