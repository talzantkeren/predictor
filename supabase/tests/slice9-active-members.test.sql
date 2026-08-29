begin;

select no_plan();

select ok(
  to_regprocedure(
    'public.get_active_league_members_page(uuid,timestamptz,uuid,integer)'
  ) is not null
  and (
    select prosecdef and proconfig @> array['search_path=""']
    from pg_proc
    where oid = 'public.get_active_league_members_page(uuid,timestamptz,uuid,integer)'::regprocedure
  ),
  'the active-member directory is a security-definer RPC with an empty search path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_active_league_members_page(uuid,timestamptz,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.get_active_league_members_page(uuid,timestamptz,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.get_active_league_members_page(uuid,timestamptz,uuid,integer)',
    'EXECUTE'
  ),
  'only authenticated user sessions can execute the member directory'
);

select is(
  (
    select string_agg(parameter_name::text, ',' order by ordinal_position)
    from information_schema.parameters
    where specific_schema = 'public'
      and specific_name like 'get_active_league_members_page_%'
      and parameter_mode = 'OUT'
  ),
  'membership_id,display_name,approved_at'::text,
  'the directory return shape excludes email, user ID, auth metadata and proof fields'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  ('de000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated',
  'active-member-' || n || '@example.com',
  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('display_name', 'Active Member ' || n),
  now(), now()
from generate_series(1, 6) as n;

insert into public.seasons (
  id, competition_id, name, starts_on, ends_on, is_current
)
values (
  'de000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000001',
  'Active Members Season', '2026-01-01', '2026-12-31', false
);

insert into public.leagues (id, manager_id, season_id, name, status)
values
  (
    'de000000-0000-4000-8000-000000000201',
    'de000000-0000-4000-8000-000000000001',
    'de000000-0000-4000-8000-000000000101',
    'Active Members Main', 'active'
  ),
  (
    'de000000-0000-4000-8000-000000000202',
    'de000000-0000-4000-8000-000000000006',
    'de000000-0000-4000-8000-000000000101',
    'Active Members Foreign', 'active'
  );

insert into public.league_members (
  id, league_id, user_id, status, approved_by, approved_at,
  removed_by, removed_at
)
values
  (
    'de000000-0000-4000-8000-000000000301',
    'de000000-0000-4000-8000-000000000201',
    'de000000-0000-4000-8000-000000000002', 'active',
    'de000000-0000-4000-8000-000000000001',
    '2026-01-01T00:00:00Z', null, null
  ),
  (
    'de000000-0000-4000-8000-000000000302',
    'de000000-0000-4000-8000-000000000201',
    'de000000-0000-4000-8000-000000000003', 'active',
    'de000000-0000-4000-8000-000000000001',
    '2026-01-02T00:00:00Z', null, null
  ),
  (
    'de000000-0000-4000-8000-000000000303',
    'de000000-0000-4000-8000-000000000201',
    'de000000-0000-4000-8000-000000000004', 'active',
    'de000000-0000-4000-8000-000000000001',
    '2026-01-03T00:00:00Z', null, null
  ),
  (
    'de000000-0000-4000-8000-000000000304',
    'de000000-0000-4000-8000-000000000201',
    'de000000-0000-4000-8000-000000000005', 'removed',
    'de000000-0000-4000-8000-000000000001',
    '2026-01-04T00:00:00Z',
    'de000000-0000-4000-8000-000000000001',
    '2026-01-05T00:00:00Z'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"de000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  $$select membership_id, display_name, approved_at
    from public.get_active_league_members_page(
      'de000000-0000-4000-8000-000000000201', null, null, 2
    )$$,
  $$values
    ('de000000-0000-4000-8000-000000000301'::uuid, 'Active Member 2'::text, '2026-01-01T00:00:00Z'::timestamptz),
    ('de000000-0000-4000-8000-000000000302'::uuid, 'Active Member 3'::text, '2026-01-02T00:00:00Z'::timestamptz),
    ('de000000-0000-4000-8000-000000000303'::uuid, 'Active Member 4'::text, '2026-01-03T00:00:00Z'::timestamptz)$$,
  'the manager receives page-size plus one active rows in stable keyset order'
);
select results_eq(
  $$select membership_id, display_name
    from public.get_active_league_members_page(
      'de000000-0000-4000-8000-000000000201',
      '2026-01-02T00:00:00Z',
      'de000000-0000-4000-8000-000000000302',
      2
    )$$,
  $$values (
    'de000000-0000-4000-8000-000000000303'::uuid,
    'Active Member 4'::text
  )$$,
  'the next keyset page has no duplicates or removed member'
);
select throws_ok(
  $$update public.league_members
    set status = 'removed'
    where id = 'de000000-0000-4000-8000-000000000301'$$,
  '42501', null,
  'the read-only directory adds no removal mutation privilege'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"de000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer
    from public.get_active_league_members_page(
      'de000000-0000-4000-8000-000000000201', null, null, 25
    )
  ),
  3,
  'an active member can read the privacy-safe active directory'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"de000000-0000-4000-8000-000000000006","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.get_active_league_members_page(
    'de000000-0000-4000-8000-000000000201', null, null, 25
  )$$,
  'P0001', 'MEMBERS_NOT_FOUND',
  'a manager of another league receives an opaque cross-league denial'
);
select throws_ok(
  $$select * from public.get_active_league_members_page(
    'de000000-0000-4000-8000-000000000201',
    '2026-01-01T00:00:00Z', null, 25
  )$$,
  'P0001', 'VALIDATION_ERROR',
  'a half-populated cursor fails closed before authorization output'
);
reset role;

select * from finish();
rollback;
