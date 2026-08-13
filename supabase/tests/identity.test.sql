begin;

select plan(42);

select ok(to_regclass('public.profiles') is not null, 'profiles table exists');

select is(
  (select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'id'),
  'uuid',
  'profiles.id is uuid'
);

select is(
  (select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_name'),
  'text',
  'profiles.display_name is text'
);

select is(
  (select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'created_at'),
  'timestamp with time zone',
  'profiles.created_at is timestamptz'
);

select is(
  (select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'updated_at'),
  'timestamp with time zone',
  'profiles.updated_at is timestamptz'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'p'
  ),
  'profiles has a primary key'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
  ),
  'profiles references auth.users'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_display_name_trimmed_check'
      and contype = 'c'
  ),
  'display_name has a trim constraint'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_display_name_length_check'
      and contype = 'c'
  ),
  'display_name has a length constraint'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has row level security enabled'
);

select ok(
  exists (
    select 1 from pg_policy
    where polrelid = 'public.profiles'::regclass
      and polname = 'profiles_select_own'
      and polcmd = 'r'
  ),
  'profiles has a self-select policy'
);

select ok(
  exists (
    select 1 from pg_policy
    where polrelid = 'public.profiles'::regclass
      and polname = 'profiles_update_own'
      and polcmd = 'w'
  ),
  'profiles has a self-update policy'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and tgname = 'auth_user_created_create_profile'
      and not tgisinternal
  ),
  'auth.users has the profile creation trigger'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_set_updated_at'
      and not tgisinternal
  ),
  'profiles has the updated_at trigger'
);

select ok(
  (select prosecdef from pg_proc
   where oid = 'public.handle_new_auth_user()'::regprocedure),
  'profile creation function is security definer'
);

select is(
  (select array_to_string(proconfig, ',') from pg_proc
   where oid = 'public.handle_new_auth_user()'::regprocedure),
  'search_path=""',
  'profile creation function has an empty search_path'
);

select ok(
  not exists (
    select 1
    from pg_proc
    cross join lateral aclexplode(
      coalesce(pg_proc.proacl, acldefault('f', pg_proc.proowner))
    ) as privileges
    where pg_proc.oid in (
      'public.handle_new_auth_user()'::regprocedure,
      'public.set_profile_updated_at()'::regprocedure
    )
      and privileges.grantee = 0
      and privileges.privilege_type = 'EXECUTE'
  ),
  'profile trigger functions are not executable by PUBLIC'
);

select ok(
  not has_function_privilege('anon', 'public.handle_new_auth_user()', 'EXECUTE'),
  'anon cannot execute the profile creation function'
);

select ok(
  not has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'EXECUTE'),
  'authenticated cannot execute the profile creation function'
);

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'SELECT'),
  'authenticated can select display_name'
);

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE'),
  'authenticated can update display_name'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE'),
  'authenticated cannot update id'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE'),
  'authenticated cannot update created_at'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'UPDATE'),
  'authenticated cannot update updated_at'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  'authenticated cannot insert profiles'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'authenticated cannot delete profiles'
);

select ok(
  not has_column_privilege('anon', 'public.profiles', 'display_name', 'SELECT'),
  'anon cannot select profiles'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'first@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"  משתמש ראשון  "}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'second@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"x"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'missing@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'numeric@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":42}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '50000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    repeat('a', 51) || '@example.com',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', repeat('א', 51)),
    now(),
    now()
  );

select is(
  (select display_name from public.profiles
   where id = '10000000-0000-0000-0000-000000000001'),
  'משתמש ראשון',
  'profile trigger trims a valid metadata display name'
);

select is(
  (select display_name from public.profiles
   where id = '20000000-0000-0000-0000-000000000002'),
  'second',
  'profile trigger falls back safely for invalid metadata'
);

select is(
  (select display_name from public.profiles
   where id = '30000000-0000-0000-0000-000000000003'),
  'missing',
  'profile trigger falls back to the email when metadata is missing'
);

select is(
  (select display_name from public.profiles
   where id = '40000000-0000-0000-0000-000000000004'),
  'numeric',
  'profile trigger rejects non-string metadata and falls back to the email'
);

select is(
  (select display_name from public.profiles
   where id = '50000000-0000-0000-0000-000000000005'),
  'משתמש 50000000',
  'profile trigger uses the UUID fallback when metadata and email are too long'
);

select throws_ok(
  $$update public.profiles set display_name = 'x'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'database rejects a display name shorter than two characters'
);

select throws_ok(
  $$update public.profiles set display_name = repeat('א', 51)
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'database rejects a display name longer than fifty characters'
);

select throws_ok(
  $$update public.profiles set display_name = E'\t\t'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'database rejects a display name containing only ASCII whitespace'
);

select throws_ok(
  $$update public.profiles set display_name = U&'\00A0\00A0'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'database rejects a display name containing only non-breaking spaces'
);

update public.profiles
set updated_at = '2000-01-01 00:00:00+00'
where id = '30000000-0000-0000-0000-000000000003';

update public.profiles
set display_name = display_name
where id = '30000000-0000-0000-0000-000000000003';

select is(
  (select updated_at from public.profiles
   where id = '30000000-0000-0000-0000-000000000003'),
  '2000-01-01 00:00:00+00'::timestamptz,
  'updated_at remains unchanged when display_name is unchanged'
);

update public.profiles
set display_name = 'missing updated'
where id = '30000000-0000-0000-0000-000000000003';

select ok(
  (select updated_at > '2000-01-01 00:00:00+00'::timestamptz
   from public.profiles
   where id = '30000000-0000-0000-0000-000000000003'),
  'updated_at advances when display_name changes'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$select display_name from public.profiles order by id$$,
  array['משתמש ראשון']::text[],
  'an authenticated user reads only their own profile'
);

select results_eq(
  $$with changed as (
      update public.profiles
      set display_name = 'שם מעודכן'
      where id = '10000000-0000-0000-0000-000000000001'
      returning display_name
    ) select display_name from changed$$,
  array['שם מעודכן']::text[],
  'an authenticated user updates their own display name'
);

select results_eq(
  $$with changed as (
      update public.profiles
      set display_name = 'גישה זרה'
      where id = '20000000-0000-0000-0000-000000000002'
      returning display_name
    ) select display_name from changed$$,
  array[]::text[],
  'an authenticated user cannot update another profile'
);

reset role;

select is(
  (select display_name from public.profiles
   where id = '20000000-0000-0000-0000-000000000002'),
  'second',
  'the foreign profile remains unchanged'
);

select * from finish();
rollback;
