begin;

select no_plan();

-- ===== Slice 3 schema, RLS, grants, and function contracts =====

select ok(to_regclass('public.invite_links') is not null, 'invite_links exists');
select ok(to_regclass('public.join_requests') is not null, 'join_requests exists');
select ok(to_regclass('public.payment_proofs') is not null, 'payment_proofs exists');
select ok(to_regclass('public.rate_limit_events') is not null, 'rate_limit_events exists');
select ok(to_regclass('public.audit_logs') is not null, 'audit_logs exists');

select is(
  (select array_agg(enumlabel order by enumsortorder)::text
   from pg_enum
   join pg_type on pg_type.oid = pg_enum.enumtypid
   join pg_namespace on pg_namespace.oid = pg_type.typnamespace
   where pg_namespace.nspname = 'public' and pg_type.typname = 'invite_status'),
  '{active,revoked}',
  'invite_status has only active and revoked'
);

select is(
  (select array_agg(enumlabel order by enumsortorder)::text
   from pg_enum
   join pg_type on pg_type.oid = pg_enum.enumtypid
   join pg_namespace on pg_namespace.oid = pg_type.typnamespace
   where pg_namespace.nspname = 'public' and pg_type.typname = 'join_request_status'),
  '{pending_proof,pending_approval,approved,rejected}',
  'join_request_status has the canonical lifecycle'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invite_links'
      and column_name in ('raw_token', 'token')
  ),
  'raw invite tokens have no storage column'
);

select results_eq(
  $$select jsonb_build_array(
      columns.table_name::text,
      columns.column_name::text,
      columns.udt_name::text,
      columns.is_nullable::text,
      columns.column_default::text
    )
    from information_schema.columns as columns
    where columns.table_schema = 'public'
      and columns.table_name in (
        'audit_logs',
        'invite_links',
        'join_requests',
        'payment_proofs',
        'rate_limit_events'
      )
    order by columns.table_name, columns.ordinal_position$$,
  $$select jsonb_build_array(
      expected.table_name,
      expected.column_name,
      expected.udt_name,
      expected.is_nullable,
      expected.column_default
    )
    from (values
    ('audit_logs'::text, 'id'::text, 'uuid'::text, 'NO'::text, 'extensions.gen_random_uuid()'::text),
    ('audit_logs', 'actor_id', 'uuid', 'NO', null::text),
    ('audit_logs', 'action', 'text', 'NO', null::text),
    ('audit_logs', 'entity_type', 'text', 'NO', null::text),
    ('audit_logs', 'entity_id', 'uuid', 'NO', null::text),
    ('audit_logs', 'metadata', 'jsonb', 'NO', '''{}''::jsonb'),
    ('audit_logs', 'created_at', 'timestamptz', 'NO', 'now()'),
    ('invite_links', 'id', 'uuid', 'NO', 'extensions.gen_random_uuid()'),
    ('invite_links', 'public_id', 'uuid', 'NO', 'extensions.gen_random_uuid()'),
    ('invite_links', 'league_id', 'uuid', 'NO', null::text),
    ('invite_links', 'token_hash', 'text', 'NO', null::text),
    ('invite_links', 'status', 'invite_status', 'NO', '''active''::invite_status'),
    ('invite_links', 'expires_at', 'timestamptz', 'NO', null::text),
    ('invite_links', 'created_by', 'uuid', 'NO', null::text),
    ('invite_links', 'created_at', 'timestamptz', 'NO', 'now()'),
    ('invite_links', 'revoked_at', 'timestamptz', 'YES', null::text),
    ('invite_links', 'updated_at', 'timestamptz', 'NO', 'now()'),
    ('join_requests', 'id', 'uuid', 'NO', 'extensions.gen_random_uuid()'),
    ('join_requests', 'league_id', 'uuid', 'NO', null::text),
    ('join_requests', 'user_id', 'uuid', 'NO', null::text),
    ('join_requests', 'status', 'join_request_status', 'NO', '''pending_proof''::join_request_status'),
    ('join_requests', 'rejection_reason', 'text', 'YES', null::text),
    ('join_requests', 'decided_by', 'uuid', 'YES', null::text),
    ('join_requests', 'decided_at', 'timestamptz', 'YES', null::text),
    ('join_requests', 'created_at', 'timestamptz', 'NO', 'now()'),
    ('join_requests', 'updated_at', 'timestamptz', 'NO', 'now()'),
    ('payment_proofs', 'id', 'uuid', 'NO', null::text),
    ('payment_proofs', 'join_request_id', 'uuid', 'NO', null::text),
    ('payment_proofs', 'uploaded_by', 'uuid', 'NO', null::text),
    ('payment_proofs', 'storage_path', 'text', 'NO', null::text),
    ('payment_proofs', 'mime_type', 'text', 'NO', '''image/webp''::text'),
    ('payment_proofs', 'size_bytes', 'int4', 'NO', null::text),
    ('payment_proofs', 'sha256', 'text', 'NO', null::text),
    ('payment_proofs', 'upload_idempotency_key', 'uuid', 'NO', null::text),
    ('payment_proofs', 'uploaded_at', 'timestamptz', 'NO', 'now()'),
    ('payment_proofs', 'deleted_at', 'timestamptz', 'YES', null::text),
    ('rate_limit_events', 'id', 'uuid', 'NO', 'extensions.gen_random_uuid()'),
    ('rate_limit_events', 'user_id', 'uuid', 'NO', null::text),
    ('rate_limit_events', 'join_request_id', 'uuid', 'NO', null::text),
    ('rate_limit_events', 'action', 'text', 'NO', '''proof_upload''::text'),
    ('rate_limit_events', 'created_at', 'timestamptz', 'NO', 'now()')
    ) as expected(
      table_name,
      column_name,
      udt_name,
      is_nullable,
      column_default
    )$$,
  'Slice 3 columns, types, nullability, and defaults match the contract'
);

select results_eq(
  $$select jsonb_build_array(
      source.relname::text,
      constraint_row.conname::text,
      target_namespace.nspname::text || '.' || target.relname::text,
      constraint_row.confdeltype::text
    )
    from pg_constraint as constraint_row
    join pg_class as source on source.oid = constraint_row.conrelid
    join pg_namespace as source_namespace
      on source_namespace.oid = source.relnamespace
    join pg_class as target on target.oid = constraint_row.confrelid
    join pg_namespace as target_namespace
      on target_namespace.oid = target.relnamespace
    where source_namespace.nspname = 'public'
      and source.relname in (
        'audit_logs',
        'invite_links',
        'join_requests',
        'payment_proofs',
        'rate_limit_events'
      )
      and constraint_row.contype = 'f'
    order by source.relname, constraint_row.conname$$,
  $$select jsonb_build_array(
      expected.table_name,
      expected.constraint_name,
      expected.target_table,
      expected.delete_action
    )
    from (values
    ('audit_logs'::text, 'audit_logs_actor_id_fkey'::text, 'auth.users'::text, 'r'::text),
    ('invite_links', 'invite_links_created_by_fkey', 'auth.users', 'r'),
    ('invite_links', 'invite_links_league_id_fkey', 'public.leagues', 'r'),
    ('join_requests', 'join_requests_decided_by_fkey', 'auth.users', 'r'),
    ('join_requests', 'join_requests_league_id_fkey', 'public.leagues', 'r'),
    ('join_requests', 'join_requests_user_id_fkey', 'auth.users', 'r'),
    ('payment_proofs', 'payment_proofs_join_request_id_fkey', 'public.join_requests', 'r'),
    ('payment_proofs', 'payment_proofs_uploaded_by_fkey', 'auth.users', 'r'),
    ('rate_limit_events', 'rate_limit_events_join_request_id_fkey', 'public.join_requests', 'r'),
    ('rate_limit_events', 'rate_limit_events_user_id_fkey', 'auth.users', 'r')
    ) as expected(table_name, constraint_name, target_table, delete_action)$$,
  'every Slice 3 foreign key targets the intended relation and restricts deletion'
);

select results_eq(
  $$select jsonb_build_array(
      source.relname::text,
      constraint_row.conname::text
    )
    from pg_constraint as constraint_row
    join pg_class as source on source.oid = constraint_row.conrelid
    join pg_namespace as source_namespace
      on source_namespace.oid = source.relnamespace
    where source_namespace.nspname = 'public'
      and source.relname in (
        'audit_logs',
        'invite_links',
        'join_requests',
        'payment_proofs',
        'rate_limit_events'
      )
      and constraint_row.contype = 'c'
    order by source.relname, constraint_row.conname$$,
  $$select jsonb_build_array(expected.table_name, expected.constraint_name)
    from (values
    ('audit_logs'::text, 'audit_logs_action_check'::text),
    ('audit_logs', 'audit_logs_entity_type_check'),
    ('audit_logs', 'audit_logs_metadata_check'),
    ('invite_links', 'invite_links_expiry_range_check'),
    ('invite_links', 'invite_links_lifecycle_check'),
    ('invite_links', 'invite_links_token_hash_check'),
    ('join_requests', 'join_requests_decision_lifecycle_check'),
    ('payment_proofs', 'payment_proofs_deleted_at_check'),
    ('payment_proofs', 'payment_proofs_mime_type_check'),
    ('payment_proofs', 'payment_proofs_sha256_check'),
    ('payment_proofs', 'payment_proofs_size_bytes_check'),
    ('payment_proofs', 'payment_proofs_storage_path_check'),
    ('rate_limit_events', 'rate_limit_events_action_check')
    ) as expected(table_name, constraint_name)$$,
  'all Slice 3 lifecycle, shape, size, and audit checks exist'
);

select results_eq(
  $$select jsonb_build_array(
      indexes.tablename::text,
      indexes.indexname::text
    )
    from pg_indexes as indexes
    where indexes.schemaname = 'public'
      and indexes.tablename in (
        'audit_logs',
        'invite_links',
        'join_requests',
        'payment_proofs',
        'rate_limit_events'
      )
    order by indexes.tablename, indexes.indexname$$,
  $$select jsonb_build_array(expected.table_name, expected.index_name)
    from (values
    ('audit_logs'::text, 'audit_logs_entity_created_idx'::text),
    ('audit_logs', 'audit_logs_pkey'),
    ('invite_links', 'invite_links_league_created_idx'),
    ('invite_links', 'invite_links_one_active_per_league_idx'),
    ('invite_links', 'invite_links_pkey'),
    ('invite_links', 'invite_links_public_id_key'),
    ('invite_links', 'invite_links_token_hash_key'),
    ('join_requests', 'join_requests_league_status_created_idx'),
    ('join_requests', 'join_requests_one_active_per_user_league_idx'),
    ('join_requests', 'join_requests_pkey'),
    ('join_requests', 'join_requests_user_created_idx'),
    ('payment_proofs', 'payment_proofs_pkey'),
    ('payment_proofs', 'payment_proofs_request_idempotency_key'),
    ('payment_proofs', 'payment_proofs_request_uploaded_idx'),
    ('payment_proofs', 'payment_proofs_storage_path_key'),
    ('rate_limit_events', 'rate_limit_events_pkey'),
    ('rate_limit_events', 'rate_limit_events_user_action_created_idx'),
    ('rate_limit_events', 'rate_limit_events_user_request_action_created_idx')
    ) as expected(table_name, index_name)$$,
  'all Slice 3 primary, unique, concurrency, and query indexes exist'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.invite_links'::regclass
      and conname = 'invite_links_token_hash_check'
      and contype = 'c'
  ),
  'invite hashes have a structural digest constraint'
);

select ok(
  exists (
    select 1 from pg_index
    where indexrelid = 'public.invite_links_one_active_per_league_idx'::regclass
      and indisunique
      and indpred is not null
  ),
  'one active invite per league is enforced by a partial unique index'
);

select ok(
  exists (
    select 1 from pg_index
    where indexrelid = 'public.join_requests_one_active_per_user_league_idx'::regclass
      and indisunique
      and indpred is not null
  ),
  'one active request per user and league is enforced by a partial unique index'
);

select ok(
  to_regclass('public.join_requests_league_status_created_idx') is not null,
  'manager request queue index exists'
);
select ok(
  to_regclass('public.payment_proofs_request_uploaded_idx') is not null,
  'deterministic proof-history index exists'
);
select ok(
  to_regclass('public.rate_limit_events_user_request_action_created_idx') is not null,
  'per-user/request rate-limit index exists'
);

select ok(
  not exists (
    select 1
    from pg_class
    where oid in (
      'public.invite_links'::regclass,
      'public.join_requests'::regclass,
      'public.payment_proofs'::regclass,
      'public.rate_limit_events'::regclass,
      'public.audit_logs'::regclass
    )
      and not relrowsecurity
  ),
  'RLS is enabled on every Slice 3 public table'
);

select ok(
  not has_table_privilege('authenticated', 'public.invite_links', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated has no direct invite table access'
);
select ok(
  has_table_privilege('authenticated', 'public.join_requests', 'SELECT')
  and not has_table_privilege('authenticated', 'public.join_requests', 'INSERT,UPDATE,DELETE'),
  'join requests are directly read-only under RLS'
);
select ok(
  has_column_privilege('authenticated', 'public.payment_proofs', 'id', 'SELECT')
  and not has_column_privilege('authenticated', 'public.payment_proofs', 'storage_path', 'SELECT')
  and not has_column_privilege('authenticated', 'public.payment_proofs', 'sha256', 'SELECT')
  and not has_column_privilege('authenticated', 'public.payment_proofs', 'upload_idempotency_key', 'SELECT'),
  'authenticated receives only safe proof-summary columns'
);
select ok(
  not has_table_privilege('authenticated', 'public.rate_limit_events', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.audit_logs', 'SELECT,INSERT,UPDATE,DELETE'),
  'rate-limit and audit tables have no direct authenticated access'
);
select ok(
  not has_table_privilege('anon', 'public.join_requests', 'SELECT')
  and not has_table_privilege('anon', 'public.payment_proofs', 'SELECT')
  and not has_table_privilege('anon', 'public.invite_links', 'SELECT'),
  'anonymous users cannot read Slice 3 tables'
);

select ok(
  has_column_privilege('service_role', 'public.payment_proofs', 'id', 'SELECT')
  and has_column_privilege('service_role', 'public.payment_proofs', 'storage_path', 'SELECT')
  and has_column_privilege('service_role', 'public.payment_proofs', 'deleted_at', 'SELECT')
  and not has_column_privilege('service_role', 'public.payment_proofs', 'sha256', 'SELECT')
  and not has_table_privilege('service_role', 'public.payment_proofs', 'INSERT,UPDATE,DELETE'),
  'service_role has only the narrow signed-access proof lookup grant'
);
select ok(
  not has_table_privilege('service_role', 'public.invite_links', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.join_requests', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.rate_limit_events', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.audit_logs', 'SELECT,INSERT,UPDATE,DELETE'),
  'service_role has no general Slice 3 business-table access'
);

select is(
  (select count(*)::integer
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'public'
     and proname in (
       'create_or_rotate_invite',
       'get_league_invite_metadata',
       'revoke_invite',
       'resolve_invite',
       'submit_join_request',
       'get_my_join_requests_page',
       'get_join_request_upload_context',
       'consume_proof_upload_rate_limit',
       'finalize_payment_proof',
       'authorize_payment_proof_access'
     )),
  10,
  'all ten narrowly scoped Slice 3 RPCs exist'
);

select is(
  pg_get_function_arguments('public.resolve_invite(uuid,text)'::regprocedure),
  'p_public_id uuid, p_token_hash text',
  'invite resolution binds a public identifier to a named token digest'
);
select is(
  pg_get_function_arguments('public.submit_join_request(uuid,text)'::regprocedure),
  'p_public_id uuid, p_token_hash text',
  'join submission binds a public identifier to a named token digest'
);
select ok(
  to_regprocedure('private.invite_token_is_valid(text)') is null
  and to_regprocedure('private.invite_token_hash_is_valid(text)') is not null,
  'the database exposes no raw-token validator for resolver or submission use'
);
select ok(
  private.invite_token_hash_is_valid(repeat('a', 64))
  and not private.invite_token_hash_is_valid(repeat('A', 64))
  and not private.invite_token_hash_is_valid(repeat('a', 63))
  and not private.invite_token_hash_is_valid(repeat('a', 65)),
  'token digests require exactly 64 lowercase hexadecimal characters'
);
select ok(
  to_regprocedure(
    'private.join_request_eligibility(uuid,text,uuid,timestamptz,boolean)'
  ) is not null
  and not has_function_privilege(
    'authenticated',
    'private.join_request_eligibility(uuid,text,uuid,timestamptz,boolean)',
    'EXECUTE'
  )
  and position(
    'private.join_request_eligibility' in
    pg_get_functiondef('public.resolve_invite(uuid,text)'::regprocedure)
  ) > 0
  and (
    position(
      'private.join_request_eligibility' in
      pg_get_functiondef('public.submit_join_request(uuid,text)'::regprocedure)
    ) > 0
    or (
      position(
        'private.slice9_submit_join_request_without_activation_guard' in
        pg_get_functiondef('public.submit_join_request(uuid,text)'::regprocedure)
      ) > 0
      and position(
        'private.join_request_eligibility' in
        pg_get_functiondef(
          'private.slice9_submit_join_request_without_activation_guard(uuid,text)'::regprocedure
        )
      ) > 0
    )
  ),
  'one private admission rule is reused by resolution and submission'
);

select ok(
  (select bool_and(prosecdef and proconfig @> array['search_path=""'])
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'public'
     and proname in (
       'create_or_rotate_invite',
       'get_league_invite_metadata',
       'revoke_invite',
       'resolve_invite',
       'submit_join_request',
       'get_my_join_requests_page',
       'get_join_request_upload_context',
       'consume_proof_upload_rate_limit',
       'finalize_payment_proof',
       'authorize_payment_proof_access'
     )),
  'every Slice 3 RPC is security definer with an empty search_path'
);

select ok(
  has_function_privilege('anon', 'public.resolve_invite(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.create_or_rotate_invite(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.submit_join_request(uuid,text)', 'EXECUTE'),
  'anon can execute only the safe invite resolver'
);
select results_eq(
  $$select jsonb_build_array(
      procedures.proname::text,
      has_function_privilege('anon', procedures.oid, 'EXECUTE')
    )
    from pg_proc as procedures
    join pg_namespace as namespaces on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'public'
      and procedures.proname in (
        'create_or_rotate_invite',
        'get_league_invite_metadata',
        'revoke_invite',
        'resolve_invite',
        'submit_join_request',
        'get_my_join_requests_page',
        'get_join_request_upload_context',
        'consume_proof_upload_rate_limit',
        'finalize_payment_proof',
        'authorize_payment_proof_access'
      )
    order by procedures.proname$$,
  $$select jsonb_build_array(expected.function_name, expected.can_execute)
    from (values
    ('authorize_payment_proof_access'::text, false),
    ('consume_proof_upload_rate_limit', false),
    ('create_or_rotate_invite', false),
    ('finalize_payment_proof', false),
    ('get_join_request_upload_context', false),
    ('get_league_invite_metadata', false),
    ('get_my_join_requests_page', false),
    ('resolve_invite', true),
    ('revoke_invite', false),
    ('submit_join_request', false)
    ) as expected(function_name, can_execute)$$,
  'anonymous execution is limited to the safe invite resolver'
);
select ok(
  has_function_privilege('authenticated', 'public.resolve_invite(uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.create_or_rotate_invite(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.submit_join_request(uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.finalize_payment_proof(uuid,uuid,uuid,text,integer)', 'EXECUTE'),
  'authenticated can execute the intended user RPCs'
);
select is(
  (select count(*)::integer
   from pg_proc as procedures
   join pg_namespace as namespaces on namespaces.oid = procedures.pronamespace
   where namespaces.nspname = 'public'
     and procedures.proname in (
       'create_or_rotate_invite',
       'get_league_invite_metadata',
       'revoke_invite',
       'resolve_invite',
       'submit_join_request',
       'get_my_join_requests_page',
       'get_join_request_upload_context',
       'consume_proof_upload_rate_limit',
       'finalize_payment_proof',
       'authorize_payment_proof_access'
     )
     and has_function_privilege('authenticated', procedures.oid, 'EXECUTE')),
  10,
  'authenticated can execute every and only the ten intended Slice 3 RPCs'
);
select ok(
  not exists (
    select 1
    from pg_proc as procedures
    join pg_namespace as namespaces on namespaces.oid = procedures.pronamespace
    cross join lateral aclexplode(
      coalesce(procedures.proacl, acldefault('f', procedures.proowner))
    ) as privilege
    where namespaces.nspname = 'public'
      and procedures.proname in (
        'create_or_rotate_invite',
        'get_league_invite_metadata',
        'revoke_invite',
        'resolve_invite',
        'submit_join_request',
        'get_my_join_requests_page',
        'get_join_request_upload_context',
        'consume_proof_upload_rate_limit',
        'finalize_payment_proof',
        'authorize_payment_proof_access'
      )
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no implicit execute grant on Slice 3 RPCs'
);
select ok(
  not exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and proname in (
        'create_or_rotate_invite',
        'get_league_invite_metadata',
        'revoke_invite',
        'resolve_invite',
        'submit_join_request',
        'get_my_join_requests_page',
        'get_join_request_upload_context',
        'consume_proof_upload_rate_limit',
        'finalize_payment_proof',
        'authorize_payment_proof_access'
      )
      and has_function_privilege('service_role', pg_proc.oid, 'EXECUTE')
  ),
  'service_role cannot execute user-scoped Slice 3 RPCs'
);
select ok(
  to_regprocedure('public.approve_join_request(uuid)') is not null
  and to_regprocedure('public.reject_join_request(uuid,text)') is not null,
  'the hosted Slice 4 manager workflow includes approval and rejection RPCs'
);

-- ===== Test actors and helpers; raw tokens remain stack-local only =====

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '71000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'slice3-manager-a@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"מנהלת שלוש א"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '72000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'slice3-requester-b@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"מבקש שלוש ב"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '73000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'slice3-outsider-c@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"זרה שלוש ג"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '74000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'slice3-manager-d@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"מנהל שלוש ד"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '75000000-0000-4000-8000-000000000005',
    'authenticated', 'authenticated', 'slice3-requester-e@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"מבקשת שלוש ה"}'::jsonb, now(), now()
  );

create function pg_temp.set_actor(p_actor_id uuid)
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

create function pg_temp.hash_invite_for_rpc(p_raw_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    extensions.digest(convert_to(p_raw_token, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

create function pg_temp.create_test_league(
  p_actor_id uuid,
  p_name text,
  p_joins_close_at timestamptz default null,
  p_allow_late_join boolean default true
)
returns uuid
language plpgsql
as $$
declare
  v_league_id uuid;
begin
  perform pg_temp.set_actor(p_actor_id);
  select public.create_league(
    '26000000-0000-4000-8000-000000000027',
    p_name,
    null,
    0,
    null,
    p_joins_close_at,
    p_allow_late_join,
    3::smallint,
    1::smallint,
    0::smallint,
    '[{"position":1,"percentage_bps":10000}]'::jsonb
  ) into v_league_id;
  return v_league_id;
end;
$$;

create function pg_temp.create_invite_facts(
  p_manager_id uuid,
  p_league_id uuid
)
returns table (
  invite_id uuid,
  public_id_format_valid boolean,
  token_format_valid boolean,
  expires_in_seven_days boolean
)
language plpgsql
as $$
declare
  v_invite_id uuid;
  v_public_id uuid;
  v_created_at timestamptz;
  v_expires_at timestamptz;
  v_raw_token text;
begin
  perform pg_temp.set_actor(p_manager_id);
  select created.invite_id, created.public_id, created.created_at,
         created.expires_at, created.raw_token
    into v_invite_id, v_public_id, v_created_at, v_expires_at, v_raw_token
    from public.create_or_rotate_invite(p_league_id) as created;

  return query
  select
    v_invite_id,
    v_public_id is not null and v_public_id <> v_invite_id,
    v_raw_token ~ '^[A-Za-z0-9_-]{43}$',
    v_expires_at - v_created_at = interval '7 days';
end;
$$;

create function pg_temp.rotation_visibility(
  p_manager_id uuid,
  p_league_id uuid
)
returns table (
  old_available boolean,
  new_available boolean,
  cross_pair_available boolean,
  active_count integer
)
language plpgsql
as $$
declare
  v_old_public_id uuid;
  v_new_public_id uuid;
  v_old_token text;
  v_new_token text;
  v_old_available boolean;
  v_new_available boolean;
  v_cross_pair_available boolean;
begin
  perform pg_temp.set_actor(p_manager_id);
  select created.public_id, created.raw_token
    into v_old_public_id, v_old_token
  from public.create_or_rotate_invite(p_league_id) as created;
  select created.public_id, created.raw_token
    into v_new_public_id, v_new_token
  from public.create_or_rotate_invite(p_league_id) as created;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select resolved.available into v_old_available
  from public.resolve_invite(
    v_old_public_id,
    pg_temp.hash_invite_for_rpc(v_old_token)
  ) as resolved;
  select resolved.available into v_new_available
  from public.resolve_invite(
    v_new_public_id,
    pg_temp.hash_invite_for_rpc(v_new_token)
  ) as resolved;
  select resolved.available into v_cross_pair_available
  from public.resolve_invite(
    v_new_public_id,
    pg_temp.hash_invite_for_rpc(v_old_token)
  ) as resolved;

  return query
  select
    v_old_available,
    v_new_available,
    v_cross_pair_available,
    (select count(*)::integer
     from public.invite_links as invite
     where invite.league_id = p_league_id and invite.status = 'active');
end;
$$;

create function pg_temp.stale_transaction_rotation_facts()
returns table (
  stale_transaction_modeled boolean,
  rotation_succeeded boolean,
  active_count integer,
  revoked_lifecycle_valid boolean
)
language plpgsql
as $$
declare
  v_manager_id constant uuid := '74000000-0000-4000-8000-000000000004';
  v_league_id uuid;
  v_previous_invite_id uuid;
  v_previous_created_at timestamptz;
  v_rotated_invite_id uuid;
begin
  v_league_id := pg_temp.create_test_league(
    v_manager_id,
    'ליגה לבדיקת זמן טרנזקציה מיושן'
  );
  update public.leagues set status = 'open' where id = v_league_id;

  -- Deterministically model the losing concurrent transaction: this pgTAP
  -- transaction started earlier, while the winning invite is committed later.
  -- A rotation based on now() would try to revoke it with an earlier timestamp.
  perform pg_sleep(0.01);
  v_previous_created_at := clock_timestamp();
  v_previous_invite_id := extensions.gen_random_uuid();
  insert into public.invite_links (
    id,
    league_id,
    token_hash,
    status,
    expires_at,
    created_by,
    created_at,
    updated_at
  )
  values (
    v_previous_invite_id,
    v_league_id,
    encode(
      extensions.digest(
        convert_to(extensions.gen_random_uuid()::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    ),
    'active',
    v_previous_created_at + interval '7 days',
    v_manager_id,
    v_previous_created_at,
    v_previous_created_at
  );

  perform pg_sleep(0.01);
  perform pg_temp.set_actor(v_manager_id);
  select rotated.invite_id into v_rotated_invite_id
  from public.create_or_rotate_invite(v_league_id) as rotated;

  return query
  select
    now() < v_previous_created_at,
    v_rotated_invite_id is not null,
    (select count(*)::integer
     from public.invite_links as invite
     where invite.league_id = v_league_id
       and invite.status = 'active'),
    (select invite.revoked_at >= invite.created_at
     from public.invite_links as invite
     where invite.id = v_previous_invite_id);
end;
$$;

create function pg_temp.rotate_and_submit(
  p_manager_id uuid,
  p_requester_id uuid,
  p_league_id uuid
)
returns table (
  invite_id uuid,
  first_request_id uuid,
  second_request_id uuid,
  viewer_state text
)
language plpgsql
as $$
declare
  v_invite_id uuid;
  v_public_id uuid;
  v_raw_token text;
  v_first_request_id uuid;
  v_second_request_id uuid;
  v_viewer_state text;
begin
  perform pg_temp.set_actor(p_manager_id);
  select created.invite_id, created.public_id, created.raw_token
    into v_invite_id, v_public_id, v_raw_token
    from public.create_or_rotate_invite(p_league_id) as created;

  perform pg_temp.set_actor(p_requester_id);
  select submitted.request_id into v_first_request_id
  from public.submit_join_request(
    v_public_id,
    pg_temp.hash_invite_for_rpc(v_raw_token)
  ) as submitted;
  select submitted.request_id into v_second_request_id
  from public.submit_join_request(
    v_public_id,
    pg_temp.hash_invite_for_rpc(v_raw_token)
  ) as submitted;
  select resolved.viewer_state into v_viewer_state
  from public.resolve_invite(
    v_public_id,
    pg_temp.hash_invite_for_rpc(v_raw_token)
  ) as resolved;

  return query
  select v_invite_id, v_first_request_id, v_second_request_id, v_viewer_state;
end;
$$;

create function pg_temp.revoked_invite_submit(
  p_manager_id uuid,
  p_requester_id uuid,
  p_league_id uuid
)
returns void
language plpgsql
as $$
declare
  v_invite_id uuid;
  v_public_id uuid;
  v_raw_token text;
begin
  perform pg_temp.set_actor(p_manager_id);
  select created.invite_id, created.public_id, created.raw_token
    into v_invite_id, v_public_id, v_raw_token
  from public.create_or_rotate_invite(p_league_id) as created;
  perform public.revoke_invite(v_invite_id);
  perform pg_temp.set_actor(p_requester_id);
  perform public.submit_join_request(
    v_public_id,
    pg_temp.hash_invite_for_rpc(v_raw_token)
  );
end;
$$;

create temp table slice3_leagues (
  label text primary key,
  id uuid not null
);

insert into slice3_leagues (label, id)
values
  (
    'manager-a',
    pg_temp.create_test_league(
      '71000000-0000-4000-8000-000000000001',
      'ליגת סלייס שלוש א'
    )
  ),
  (
    'manager-d',
    pg_temp.create_test_league(
      '74000000-0000-4000-8000-000000000004',
      'ליגת סלייס שלוש ד'
    )
  ),
  (
    'closed-at-boundary',
    pg_temp.create_test_league(
      '71000000-0000-4000-8000-000000000001',
      'ליגה סגורה בגבול',
      now(),
      true
    )
  );

select throws_ok(
  $$with event_time as (
      select clock_timestamp() as value
    )
    insert into public.invite_links (
      league_id,
      token_hash,
      status,
      expires_at,
      created_by,
      created_at,
      revoked_at
    )
    select
      (select id from slice3_leagues where label = 'manager-d'),
      repeat('z', 64),
      'revoked',
      event_time.value + interval '7 days',
      '74000000-0000-4000-8000-000000000004',
      event_time.value,
      event_time.value
    from event_time$$,
  '23514', null,
  'invite token hashes reject non-hexadecimal data at the table boundary'
);

select throws_ok(
  $$with event_time as (
      select clock_timestamp() as value
    )
    insert into public.invite_links (
      league_id,
      token_hash,
      status,
      expires_at,
      created_by,
      created_at,
      revoked_at
    )
    select
      (select id from slice3_leagues where label = 'manager-d'),
      repeat('1', 64),
      'revoked',
      event_time.value + interval '31 days',
      '74000000-0000-4000-8000-000000000004',
      event_time.value,
      event_time.value
    from event_time$$,
  '23514', null,
  'invite expiry must remain within the database-enforced one-to-thirty-day range'
);

select throws_ok(
  $$with event_time as (
      select clock_timestamp() as value
    )
    insert into public.invite_links (
      league_id,
      token_hash,
      status,
      expires_at,
      created_by,
      created_at,
      revoked_at
    )
    select
      (select id from slice3_leagues where label = 'manager-d'),
      repeat('2', 64),
      'active',
      event_time.value + interval '7 days',
      '74000000-0000-4000-8000-000000000004',
      event_time.value,
      event_time.value
    from event_time$$,
  '23514', null,
  'an active invite cannot carry contradictory revocation data'
);

select throws_ok(
  $$insert into public.join_requests (
      league_id,
      user_id,
      status
    )
    values (
      (select id from slice3_leagues where label = 'manager-d'),
      '75000000-0000-4000-8000-000000000005',
      'approved'
    )$$,
  '23514', null,
  'an approved request requires consistent decision fields'
);

select throws_ok(
  $$insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, metadata
    ) values (
      '71000000-0000-4000-8000-000000000001',
      'x',
      'invite_link',
      extensions.gen_random_uuid(),
      '{}'::jsonb
    )$$,
  '23514', null,
  'audit action names enforce their trimmed length contract'
);

select throws_ok(
  $$insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, metadata
    ) values (
      '71000000-0000-4000-8000-000000000001',
      'invite.tested',
      'Invalid Entity',
      extensions.gen_random_uuid(),
      '{}'::jsonb
    )$$,
  '23514', null,
  'audit entity types enforce the safe identifier format'
);

select throws_ok(
  $$insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, metadata
    ) values (
      '71000000-0000-4000-8000-000000000001',
      'invite.tested',
      'invite_link',
      extensions.gen_random_uuid(),
      '[]'::jsonb
    )$$,
  '23514', null,
  'audit metadata must be a JSON object'
);

create temp table slice3_invite_facts as
select *
from pg_temp.create_invite_facts(
  '71000000-0000-4000-8000-000000000001',
  (select id from slice3_leagues where label = 'manager-a')
);

select ok(
  (select public_id_format_valid from slice3_invite_facts),
  'invite creation returns a distinct random public identifier for the path'
);
select ok(
  (select token_format_valid from slice3_invite_facts),
  'the database generates a 32-byte unpadded base64url token'
);
select ok(
  (select expires_in_seven_days from slice3_invite_facts),
  'new invitations expire after exactly seven days'
);
select is(
  (select status::text from public.leagues
   where id = (select id from slice3_leagues where label = 'manager-a')),
  'open',
  'first successful invite creation atomically opens a draft league'
);
select ok(
  (select token_hash ~ '^[0-9a-f]{64}$'
   from public.invite_links
   where id = (select invite_id from slice3_invite_facts)),
  'only a SHA-256 digest is persisted for the token'
);
select is(
  (select count(*)::integer
   from public.audit_logs
   where action = 'invite.created'
     and entity_id = (select invite_id from slice3_invite_facts)),
  1,
  'invite creation appends one sanitized audit event'
);
select ok(
  not exists (
    select 1
    from public.audit_logs
    where metadata::text ~ '[A-Za-z0-9_-]{43}'
  ),
  'audit metadata contains no raw invite-shaped token'
);

select throws_ok(
  $$select * from public.create_or_rotate_invite(
    (select id from slice3_leagues where label = 'closed-at-boundary')
  )$$,
  'P0001', 'JOIN_CLOSED',
  'database time at joins_close_at blocks first invite creation'
);

select results_eq(
  $$select old_available, new_available, cross_pair_available, active_count
    from pg_temp.rotation_visibility(
      '71000000-0000-4000-8000-000000000001',
      (select id from slice3_leagues where label = 'manager-a')
    )$$,
  $$values (false, true, false, 1)$$,
  'rotation revokes the old pair, binds digest to public ID, and leaves one active invite'
);

select results_eq(
  $$select * from pg_temp.stale_transaction_rotation_facts()$$,
  $$values (true, true, 1, true)$$,
  'a rotation waiting behind a newer invite uses fresh DB time and succeeds'
);

create temp table slice3_join_result as
select *
from pg_temp.rotate_and_submit(
  '71000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002',
  (select id from slice3_leagues where label = 'manager-a')
);

grant select on slice3_leagues, slice3_join_result to authenticated;

select is(
  (select first_request_id from slice3_join_result),
  (select second_request_id from slice3_join_result),
  'submitting the same valid invite twice returns the winning request'
);
select is(
  (select viewer_state from slice3_join_result),
  'pending_proof',
  'authenticated invite resolution exposes the requester pending state'
);
select is(
  (select count(*)::integer
   from public.join_requests
   where league_id = (select id from slice3_leagues where label = 'manager-a')
     and user_id = '72000000-0000-4000-8000-000000000002'
     and status = 'pending_proof'),
  1,
  'the partial unique invariant leaves one active request'
);

select throws_ok(
  $$insert into public.rate_limit_events (
      user_id,
      join_request_id,
      action
    ) values (
      '72000000-0000-4000-8000-000000000002',
      (select first_request_id from slice3_join_result),
      'forged_action'
    )$$,
  '23514', null,
  'rate-limit rows accept only the fixed proof-upload action'
);

select throws_ok(
  $$select pg_temp.revoked_invite_submit(
    '71000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000005',
    (select id from slice3_leagues where label = 'manager-a')
  )$$,
  'P0001', 'INVITE_UNAVAILABLE',
  'a revoked invitation cannot create a new request'
);
select is(
  (select count(*)::integer from public.join_requests
   where id = (select first_request_id from slice3_join_result)),
  1,
  'revoking a later invitation does not erase an existing request'
);

select pg_temp.set_actor('71000000-0000-4000-8000-000000000001');
select is(
  (select count(*)::integer
   from public.get_league_invite_metadata(
     (select id from slice3_leagues where label = 'manager-a')
   )),
  1,
  'the exact manager can read safe current invite metadata'
);

create temp table slice3_expiry_metadata_invite as
select created.invite_id
from public.create_or_rotate_invite(
  (select id from slice3_leagues where label = 'manager-a')
) as created;

select results_eq(
  $$select metadata.status::text, metadata.is_expired
    from public.get_league_invite_metadata(
      (select id from slice3_leagues where label = 'manager-a')
    ) as metadata$$,
  $$values ('active'::text, false)$$,
  'fresh manager invite metadata is active according to database time'
);

update public.invite_links
set created_at = now() - interval '7 days',
    expires_at = now()
where id = (select invite_id from slice3_expiry_metadata_invite);

select results_eq(
  $$select metadata.status::text, metadata.is_expired
    from public.get_league_invite_metadata(
      (select id from slice3_leagues where label = 'manager-a')
    ) as metadata$$,
  $$values ('active'::text, true)$$,
  'expired manager metadata preserves the stored enum and exposes DB-effective expiry'
);

select pg_temp.set_actor('74000000-0000-4000-8000-000000000004');
select throws_ok(
  $$select * from public.get_league_invite_metadata(
    (select id from slice3_leagues where label = 'manager-a')
  )$$,
  'P0001', 'FORBIDDEN',
  'a manager of another league cannot read invite metadata'
);

select throws_ok(
  $$select * from public.create_or_rotate_invite(
      (select id from slice3_leagues where label = 'manager-a')
    )$$,
  'P0001', 'FORBIDDEN',
  'a manager of another league cannot create or rotate its invitation'
);

select throws_ok(
  $$select * from public.revoke_invite(
      (select invite_id from slice3_expiry_metadata_invite)
    )$$,
  'P0001', 'FORBIDDEN',
  'a manager of another league cannot revoke its invitation'
);

select results_eq(
  $$select invite.status::text, invite.revoked_at
    from public.invite_links as invite
    where invite.id = (select invite_id from slice3_expiry_metadata_invite)$$,
  $$values ('active'::text, null::timestamptz)$$,
  'hostile invite RPC calls leave the foreign invitation unchanged'
);

select results_eq(
  $$select available, league_name
    from public.resolve_invite(
      '26000000-0000-4000-8000-000000000099',
      'malformed'
    )$$,
  $$values (false, null::text)$$,
  'malformed invite digests return the same unavailable DTO without lookup data'
);
select results_eq(
  $$select available, league_name
    from public.resolve_invite(
      '26000000-0000-4000-8000-000000000099',
      repeat('A', 43)
    )$$,
  $$values (false, null::text)$$,
  'a raw-token-shaped value is rejected before invite lookup'
);
select results_eq(
  $$select available, league_name
    from public.resolve_invite(
      '26000000-0000-4000-8000-000000000099',
      repeat('A', 64)
    )$$,
  $$values (false, null::text)$$,
  'an uppercase digest is rejected before invite lookup'
);

-- ===== Direct hostile role behavior =====

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"72000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.join_requests),
  1,
  'a requester directly reads only their own request'
);
select throws_ok(
  $$insert into public.join_requests (league_id, user_id)
    values (
      '26000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000002'
    )$$,
  '42501', null,
  'a requester cannot directly insert a request or spoof its league'
);
select throws_ok(
  $$update public.join_requests set status = 'approved'$$,
  '42501', null,
  'a requester cannot directly approve themselves'
);
select throws_ok(
  $$delete from public.join_requests$$,
  '42501', null,
  'a requester cannot delete request history'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"73000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.join_requests),
  0,
  'an unrelated user cannot read another requester data'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.join_requests
   where id = (select first_request_id from slice3_join_result)),
  1,
  'the exact league manager can read the request under RLS'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"74000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.join_requests),
  0,
  'a manager of another league cannot read the request'
);
reset role;

-- Rejected history permits a new request, while removed membership alone does
-- not grant any special authority. These privileged updates simulate Slice 4.
update public.join_requests
set status = 'rejected',
    rejection_reason = 'בקשה היסטורית שנדחתה',
    decided_by = '71000000-0000-4000-8000-000000000001',
    decided_at = now()
where id = (select first_request_id from slice3_join_result);

create temp table slice3_rejoin_result as
select *
from pg_temp.rotate_and_submit(
  '71000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002',
  (select id from slice3_leagues where label = 'manager-a')
);

select isnt(
  (select first_request_id from slice3_rejoin_result),
  (select first_request_id from slice3_join_result),
  'a rejected historical request permits a new request'
);
select is(
  (select count(*)::integer
   from public.join_requests
   where league_id = (select id from slice3_leagues where label = 'manager-a')
     and user_id = '72000000-0000-4000-8000-000000000002'),
  2,
  'rejected request history is preserved beside the new request'
);

insert into public.league_members (league_id, user_id, status, approved_by)
values (
  (select id from slice3_leagues where label = 'manager-a'),
  '73000000-0000-4000-8000-000000000003',
  'active',
  '71000000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$select * from pg_temp.rotate_and_submit(
    '71000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000003',
    (select id from slice3_leagues where label = 'manager-a')
  )$$,
  'P0001', 'FORBIDDEN',
  'an active member without an existing request cannot submit another request'
);

update public.league_members
set status = 'removed',
    removed_by = '71000000-0000-4000-8000-000000000001',
    removed_at = now()
where league_id = (select id from slice3_leagues where label = 'manager-a')
  and user_id = '73000000-0000-4000-8000-000000000003';

select lives_ok(
  $$select * from pg_temp.rotate_and_submit(
    '71000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000003',
    (select id from slice3_leagues where label = 'manager-a')
  )$$,
  'a removed member with no active request may request again'
);

-- ===== Central admission rule branches and exact time boundaries =====

create function pg_temp.admission_case(
  p_manager_id uuid,
  p_requester_id uuid,
  p_name text,
  p_status public.league_status,
  p_allow_late_join boolean,
  p_expire_at_boundary boolean default false,
  p_close_at_boundary boolean default false
)
returns table (
  available boolean,
  viewer_state text,
  submit_outcome text,
  request_count integer
)
language plpgsql
as $$
declare
  v_league_id uuid;
  v_invite_id uuid;
  v_public_id uuid;
  v_raw_token text;
  v_token_hash text;
  v_available boolean;
  v_viewer_state text;
  v_submit_outcome text;
begin
  v_league_id := pg_temp.create_test_league(
    p_manager_id,
    p_name,
    null,
    p_allow_late_join
  );
  perform pg_temp.set_actor(p_manager_id);
  select created.invite_id, created.public_id, created.raw_token
    into v_invite_id, v_public_id, v_raw_token
    from public.create_or_rotate_invite(v_league_id) as created;
  v_token_hash := pg_temp.hash_invite_for_rpc(v_raw_token);

  update public.leagues
  set status = p_status,
      allow_late_join = p_allow_late_join
  where id = v_league_id;

  if p_expire_at_boundary then
    update public.invite_links
    set created_at = now() - interval '7 days',
        expires_at = now()
    where id = v_invite_id;
  end if;

  if p_close_at_boundary then
    update public.leagues
    set joins_close_at = now()
    where id = v_league_id;
  end if;

  perform pg_temp.set_actor(p_requester_id);
  select resolved.available, resolved.viewer_state
    into v_available, v_viewer_state
    from public.resolve_invite(v_public_id, v_token_hash) as resolved;

  begin
    select submitted.status::text
      into v_submit_outcome
      from public.submit_join_request(v_public_id, v_token_hash) as submitted;
  exception
    when others then
      v_submit_outcome := sqlerrm;
  end;

  return query
  select
    v_available,
    v_viewer_state,
    v_submit_outcome,
    (select count(*)::integer
     from public.join_requests as request
     where request.league_id = v_league_id
       and request.user_id = p_requester_id);
end;
$$;

create function pg_temp.stale_submission_boundary_facts(
  p_boundary_kind text
)
returns table (
  stale_transaction_modeled boolean,
  submit_outcome text,
  request_count integer
)
language plpgsql
as $$
declare
  v_manager_id constant uuid := '74000000-0000-4000-8000-000000000004';
  v_requester_id constant uuid := '75000000-0000-4000-8000-000000000005';
  v_league_id uuid;
  v_invite_id uuid;
  v_public_id uuid;
  v_raw_token text;
  v_token_hash text;
  v_boundary timestamptz;
  v_stale_transaction_modeled boolean;
  v_submit_outcome text;
begin
  v_league_id := pg_temp.create_test_league(
    v_manager_id,
    case p_boundary_kind
      when 'expiry' then 'ליגה לבדיקת תוקף אחרי המתנה'
      else 'ליגה לבדיקת סגירה אחרי המתנה'
    end
  );
  perform pg_temp.set_actor(v_manager_id);
  select created.invite_id, created.public_id, created.raw_token
    into v_invite_id, v_public_id, v_raw_token
  from public.create_or_rotate_invite(v_league_id) as created;
  v_token_hash := pg_temp.hash_invite_for_rpc(v_raw_token);
  v_boundary := clock_timestamp() + interval '30 milliseconds';

  if p_boundary_kind = 'expiry' then
    update public.invite_links
    set created_at = v_boundary - interval '7 days',
        expires_at = v_boundary
    where id = v_invite_id;
  elsif p_boundary_kind = 'close' then
    update public.leagues
    set joins_close_at = v_boundary
    where id = v_league_id;
  else
    raise exception 'unsupported boundary kind';
  end if;

  perform pg_sleep(0.05);
  v_stale_transaction_modeled :=
    now() < v_boundary and clock_timestamp() >= v_boundary;
  perform pg_temp.set_actor(v_requester_id);

  begin
    perform public.submit_join_request(v_public_id, v_token_hash);
    v_submit_outcome := 'unexpected_success';
  exception
    when others then v_submit_outcome := sqlerrm;
  end;

  return query
  select
    v_stale_transaction_modeled,
    v_submit_outcome,
    (select count(*)::integer
     from public.join_requests as request
     where request.league_id = v_league_id
       and request.user_id = v_requester_id);
end;
$$;

select results_eq(
  $$select * from pg_temp.stale_submission_boundary_facts('expiry')$$,
  $$values (true, 'INVITE_UNAVAILABLE'::text, 0)$$,
  'submission rechecks invite expiry with fresh DB time after the league lock'
);

select results_eq(
  $$select * from pg_temp.stale_submission_boundary_facts('close')$$,
  $$values (true, 'JOIN_CLOSED'::text, 0)$$,
  'submission rechecks joins_close_at with fresh DB time after the league lock'
);

select results_eq(
  $$select * from pg_temp.admission_case(
    '74000000-0000-4000-8000-000000000004',
    '75000000-0000-4000-8000-000000000005',
    'ליגה פעילה עם הצטרפות מאוחרת',
    'active',
    true
  )$$,
  $$values (true, 'eligible'::text, 'pending_proof'::text, 1)$$,
  'active league admits a requester only when late join is enabled'
);

select results_eq(
  $$select * from pg_temp.admission_case(
    '74000000-0000-4000-8000-000000000004',
    '75000000-0000-4000-8000-000000000005',
    'ליגה פעילה ללא הצטרפות מאוחרת',
    'active',
    false
  )$$,
  $$values (true, 'closed'::text, 'JOIN_CLOSED'::text, 0)$$,
  'active league blocks a requester when late join is disabled'
);

select results_eq(
  $$select * from pg_temp.admission_case(
    '74000000-0000-4000-8000-000000000004',
    '75000000-0000-4000-8000-000000000005',
    'ליגה שהושלמה',
    'completed',
    true
  )$$,
  $$values (true, 'closed'::text, 'JOIN_CLOSED'::text, 0)$$,
  'completed league resolves as closed and blocks submission'
);

select results_eq(
  $$select * from pg_temp.admission_case(
    '74000000-0000-4000-8000-000000000004',
    '75000000-0000-4000-8000-000000000005',
    'ליגה בארכיון',
    'archived',
    true
  )$$,
  $$values (true, 'closed'::text, 'JOIN_CLOSED'::text, 0)$$,
  'archived league resolves as closed and blocks submission'
);

select results_eq(
  $$select * from pg_temp.admission_case(
    '74000000-0000-4000-8000-000000000004',
    '75000000-0000-4000-8000-000000000005',
    'ליגה עם הזמנה שפגה בגבול',
    'open',
    true,
    true
  )$$,
  $$values (false, null::text, 'INVITE_UNAVAILABLE'::text, 0)$$,
  'expires_at equal to database now is unavailable for resolve and submit'
);

select results_eq(
  $$select * from pg_temp.admission_case(
    '74000000-0000-4000-8000-000000000004',
    '75000000-0000-4000-8000-000000000005',
    'ליגה בגבול סגירת הצטרפות',
    'open',
    true,
    false,
    true
  )$$,
  $$values (true, 'closed'::text, 'JOIN_CLOSED'::text, 0)$$,
  'joins_close_at equal to database now blocks resolve eligibility and submit'
);

select results_eq(
  $$select * from pg_temp.admission_case(
    '74000000-0000-4000-8000-000000000004',
    '75000000-0000-4000-8000-000000000005',
    'ליגת טיוטה עם הזמנה היסטורית',
    'draft',
    true
  )$$,
  $$values (true, 'closed'::text, 'JOIN_CLOSED'::text, 0)$$,
  'draft league remains ineligible for resolution and submission'
);

select results_eq(
  $$select * from pg_temp.admission_case(
    '74000000-0000-4000-8000-000000000004',
    '74000000-0000-4000-8000-000000000004',
    'ליגה שבה המנהל מנסה להצטרף',
    'open',
    true
  )$$,
  $$values (true, 'manager'::text, 'FORBIDDEN'::text, 0)$$,
  'league manager cannot submit a request to their own league'
);

create function pg_temp.closed_rotation_error(
  p_name text,
  p_status public.league_status
)
returns text
language plpgsql
as $$
declare
  v_manager_id constant uuid := '74000000-0000-4000-8000-000000000004';
  v_league_id uuid;
begin
  v_league_id := pg_temp.create_test_league(v_manager_id, p_name);
  perform pg_temp.set_actor(v_manager_id);
  perform public.create_or_rotate_invite(v_league_id);
  update public.leagues set status = p_status where id = v_league_id;

  begin
    perform public.create_or_rotate_invite(v_league_id);
    return 'unexpected_success';
  exception
    when others then return sqlerrm;
  end;
end;
$$;

select is(
  pg_temp.closed_rotation_error('ליגה שהושלמה ללא פתיחה מחדש', 'completed'),
  'JOIN_CLOSED',
  'invite rotation cannot reopen a completed league'
);
select is(
  pg_temp.closed_rotation_error('ליגה בארכיון ללא פתיחה מחדש', 'archived'),
  'JOIN_CLOSED',
  'invite rotation cannot reopen an archived league'
);

create function pg_temp.revoke_twice_facts()
returns table (
  first_status text,
  second_status text,
  same_revoked_at boolean,
  audit_count integer
)
language plpgsql
as $$
declare
  v_manager_id constant uuid := '74000000-0000-4000-8000-000000000004';
  v_league_id uuid;
  v_invite_id uuid;
  v_first_status text;
  v_second_status text;
  v_first_revoked_at timestamptz;
  v_second_revoked_at timestamptz;
begin
  v_league_id := pg_temp.create_test_league(
    v_manager_id,
    'ליגה לבדיקת ביטול אידמפוטנטי'
  );
  perform pg_temp.set_actor(v_manager_id);
  select created.invite_id into v_invite_id
  from public.create_or_rotate_invite(v_league_id) as created;

  select revoked.status::text, revoked.revoked_at
    into v_first_status, v_first_revoked_at
  from public.revoke_invite(v_invite_id) as revoked;
  select revoked.status::text, revoked.revoked_at
    into v_second_status, v_second_revoked_at
  from public.revoke_invite(v_invite_id) as revoked;

  return query
  select
    v_first_status,
    v_second_status,
    v_first_revoked_at = v_second_revoked_at,
    (select count(*)::integer
     from public.audit_logs as audit
     where audit.action = 'invite.revoked'
       and audit.entity_id = v_invite_id);
end;
$$;

select results_eq(
  $$select * from pg_temp.revoke_twice_facts()$$,
  $$values ('revoked'::text, 'revoked'::text, true, 1)$$,
  'revoking the same invite twice is idempotent and audits once'
);

create function pg_temp.approved_request_replay()
returns table (same_request boolean, status text, request_count integer)
language plpgsql
as $$
declare
  v_manager_id constant uuid := '74000000-0000-4000-8000-000000000004';
  v_requester_id constant uuid := '75000000-0000-4000-8000-000000000005';
  v_league_id uuid;
  v_public_id uuid;
  v_raw_token text;
  v_request_id uuid;
  v_replayed_id uuid;
  v_replayed_status text;
begin
  v_league_id := pg_temp.create_test_league(
    v_manager_id,
    'ליגה עם בקשה מאושרת קיימת'
  );
  perform pg_temp.set_actor(v_manager_id);
  select created.public_id, created.raw_token
    into v_public_id, v_raw_token
  from public.create_or_rotate_invite(v_league_id) as created;

  perform pg_temp.set_actor(v_requester_id);
  select submitted.request_id into v_request_id
  from public.submit_join_request(
    v_public_id,
    pg_temp.hash_invite_for_rpc(v_raw_token)
  ) as submitted;

  update public.join_requests
  set status = 'approved',
      decided_by = v_manager_id,
      decided_at = now()
  where id = v_request_id;

  select submitted.request_id, submitted.status::text
    into v_replayed_id, v_replayed_status
  from public.submit_join_request(
    v_public_id,
    pg_temp.hash_invite_for_rpc(v_raw_token)
  ) as submitted;

  return query
  select
    v_replayed_id = v_request_id,
    v_replayed_status,
    (select count(*)::integer
     from public.join_requests as request
     where request.league_id = v_league_id
       and request.user_id = v_requester_id);
end;
$$;

select results_eq(
  $$select * from pg_temp.approved_request_replay()$$,
  $$values (true, 'approved'::text, 1)$$,
  'an approved active request is returned idempotently and blocks another row'
);

select * from finish();
rollback;
