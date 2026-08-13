begin;

select no_plan();

-- Schema, enum, foreign-key, check, unique, index, and reference-data contracts.
select ok(to_regclass('public.competitions') is not null, 'competitions table exists');
select ok(to_regclass('public.seasons') is not null, 'seasons table exists');
select ok(to_regclass('public.teams') is not null, 'teams table exists');
select ok(to_regclass('public.matches') is not null, 'matches table exists');
select ok(to_regclass('public.leagues') is not null, 'leagues table exists');
select ok(to_regclass('public.league_scoring_rules') is not null, 'league_scoring_rules table exists');
select ok(to_regclass('public.prize_rules') is not null, 'prize_rules table exists');
select ok(to_regclass('public.league_members') is not null, 'league_members table exists');

select is(
  (select array_agg(enumlabel order by enumsortorder)::text
   from pg_enum
   join pg_type on pg_type.oid = pg_enum.enumtypid
   join pg_namespace on pg_namespace.oid = pg_type.typnamespace
   where pg_namespace.nspname = 'public' and pg_type.typname = 'league_status'),
  '{draft,open,active,completed,archived}',
  'league_status has the canonical lifecycle'
);

select is(
  (select array_agg(enumlabel order by enumsortorder)::text
   from pg_enum
   join pg_type on pg_type.oid = pg_enum.enumtypid
   join pg_namespace on pg_namespace.oid = pg_type.typnamespace
   where pg_namespace.nspname = 'public' and pg_type.typname = 'member_status'),
  '{active,removed}',
  'member_status has the minimal lifecycle'
);

select is(
  (select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'matches' and column_name = 'kickoff_at'),
  'timestamp with time zone',
  'matches.kickoff_at is timestamptz'
);
select is(
  (select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'leagues' and column_name = 'demo_entry_fee_agorot'),
  'integer',
  'Demo entry amount uses integer agorot'
);
select is(
  (select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'prize_rules' and column_name = 'percentage_bps'),
  'integer',
  'prize percentages use integer basis points'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leagues'
      and column_name ilike '%url%'
  ),
  'leagues has no payment URL field'
);

select ok(
  (select count(*) = 3
   from pg_constraint
   where conrelid = 'public.matches'::regclass and contype = 'f'),
  'matches has the documented foreign keys'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.leagues'::regclass
      and confrelid = 'auth.users'::regclass
      and confdeltype = 'r'
  ),
  'league manager references auth.users with explicit restrict behavior'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.leagues'::regclass
      and confrelid = 'public.seasons'::regclass
      and confdeltype = 'r'
  ),
  'league season references seasons with explicit restrict behavior'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.prize_rules'::regclass
      and conname = 'prize_rules_league_position_key'
      and contype = 'u'
  ),
  'prize position is unique per league'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.league_members'::regclass
      and conname = 'league_members_league_user_key'
      and contype = 'u'
  ),
  'membership is unique per league and user'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.league_scoring_rules'::regclass
      and conname = 'league_scoring_rules_order_check'
      and contype = 'c'
  ),
  'scoring order has a database check'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.prize_rules'::regclass
      and conname = 'prize_rules_percentage_bps_check'
      and contype = 'c'
  ),
  'prize basis points have a database check'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.prize_rules'::regclass
      and tgname = 'prize_rules_validate_total'
      and tgdeferrable
      and tginitdeferred
      and not tgisinternal
  ),
  'the cross-row prize invariant is a deferred constraint trigger'
);
select ok(to_regclass('public.matches_season_kickoff_idx') is not null, 'season/kickoff index exists');
select ok(to_regclass('public.matches_status_kickoff_idx') is not null, 'status/kickoff index exists');
select ok(to_regclass('public.league_members_user_status_idx') is not null, 'dashboard membership index exists');
select ok(to_regclass('public.league_members_league_status_idx') is not null, 'league authorization index exists');

select is(
  (select name from public.competitions where id = '26000000-0000-4000-8000-000000000001'),
  'ליגת העל הישראלית',
  'the MVP competition is versioned reference data'
);
select is(
  (select name from public.seasons where id = '26000000-0000-4000-8000-000000000027'),
  '2026/27',
  'the MVP season is versioned reference data'
);
select is((select count(*)::integer from public.teams), 0, 'the catalog migration invents no teams');
select is((select count(*)::integer from public.matches), 0, 'the catalog migration invents no fixtures or scores');

-- RLS and least-privilege grants for every Slice 2 public table.
select ok(
  not exists (
    select 1
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname in (
        'competitions', 'seasons', 'teams', 'matches', 'leagues',
        'league_scoring_rules', 'prize_rules', 'league_members'
      )
      and not pg_class.relrowsecurity
  ),
  'RLS is enabled on every Slice 2 public table'
);

select ok(
  has_table_privilege('authenticated', 'public.competitions', 'SELECT')
  and has_table_privilege('authenticated', 'public.seasons', 'SELECT')
  and has_table_privilege('authenticated', 'public.teams', 'SELECT')
  and has_table_privilege('authenticated', 'public.matches', 'SELECT'),
  'authenticated can read the global sports catalog'
);
select ok(
  not has_table_privilege('authenticated', 'public.competitions', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.seasons', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.teams', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.matches', 'INSERT,UPDATE,DELETE'),
  'authenticated cannot write the global sports catalog'
);
select ok(
  not has_table_privilege('anon', 'public.competitions', 'SELECT')
  and not has_table_privilege('anon', 'public.seasons', 'SELECT')
  and not has_table_privilege('anon', 'public.teams', 'SELECT')
  and not has_table_privilege('anon', 'public.matches', 'SELECT'),
  'anon cannot read the global sports catalog'
);
select ok(
  has_table_privilege('authenticated', 'public.leagues', 'SELECT')
  and has_table_privilege('authenticated', 'public.league_scoring_rules', 'SELECT')
  and has_table_privilege('authenticated', 'public.prize_rules', 'SELECT')
  and has_table_privilege('authenticated', 'public.league_members', 'SELECT'),
  'authenticated has read-only table grants for league data'
);
select ok(
  not has_table_privilege('authenticated', 'public.leagues', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.league_scoring_rules', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.prize_rules', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.league_members', 'INSERT,UPDATE,DELETE'),
  'authenticated cannot directly write league-domain tables'
);
select ok(
  not has_table_privilege('anon', 'public.leagues', 'SELECT')
  and not has_table_privilege('anon', 'public.league_scoring_rules', 'SELECT')
  and not has_table_privilege('anon', 'public.prize_rules', 'SELECT')
  and not has_table_privilege('anon', 'public.league_members', 'SELECT'),
  'anon has no league-domain table access'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.create_league(uuid,text,text,integer,text,timestamptz,boolean,smallint,smallint,smallint,jsonb)'::regprocedure),
  'create_league is security definer'
);
select is(
  (select array_to_string(proconfig, ',') from pg_proc
   where oid = 'public.create_league(uuid,text,text,integer,text,timestamptz,boolean,smallint,smallint,smallint,jsonb)'::regprocedure),
  'search_path=""',
  'create_league has an empty search_path'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_league(uuid,text,text,integer,text,timestamptz,boolean,smallint,smallint,smallint,jsonb)',
    'EXECUTE'
  ),
  'authenticated can execute create_league'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_league(uuid,text,text,integer,text,timestamptz,boolean,smallint,smallint,smallint,jsonb)',
    'EXECUTE'
  ),
  'anon cannot execute create_league'
);
select ok(
  not has_function_privilege(
    'public',
    'public.create_league(uuid,text,text,integer,text,timestamptz,boolean,smallint,smallint,smallint,jsonb)',
    'EXECUTE'
  ),
  'PUBLIC cannot execute create_league'
);
select ok(
  not exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    cross join lateral aclexplode(coalesce(pg_proc.proacl, acldefault('f', pg_proc.proowner))) as privileges
    where pg_namespace.nspname = 'private'
      and privileges.grantee = 0
      and privileges.privilege_type = 'EXECUTE'
  ),
  'private policy and trigger functions are not executable by PUBLIC'
);
select ok(
  (select bool_and(prosecdef and proconfig @> array['search_path=""'])
   from pg_proc
   join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'private'
     and proname in ('is_active_league_member', 'is_league_manager', 'shares_active_league')),
  'RLS helper functions are security definer with empty search_path'
);

-- Test users receive profiles through the existing secured Auth trigger.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'league-a@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"מנהלת א"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b0000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'league-b@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"משתמש ב"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'league-c@example.com',
    crypt('password123', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"חברה ג"}'::jsonb, now(), now()
  );

-- Anonymous access fails at the grant boundary, including the creation function.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select * from public.seasons$$,
  '42501', null,
  'anon cannot read the season catalog'
);
select throws_ok(
  $$select * from public.leagues$$,
  '42501', null,
  'anon cannot read internal league data'
);
select throws_ok(
  $sql$select public.create_league(
    '26000000-0000-4000-8000-000000000027', 'ליגת אנונימי', null, 0, null,
    null::timestamptz, true, 3::smallint, 1::smallint, 0::smallint, '[{"position":1,"percentage_bps":10000}]'::jsonb
  )$sql$,
  '42501', null,
  'anon cannot execute league creation'
);
reset role;

-- User A creates two leagues with independent rules through the single RPC.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $sql$select public.create_league(
    '26000000-0000-4000-8000-000000000027',
    '  ליגת א הראשונה  ',
    '  תיאור בדיקה  ',
    2500,
    '  סימון ידני בלבד  ',
    null::timestamptz,
    true,
    3::smallint,
    1::smallint,
    0::smallint,
    '[{"position":1,"percentage_bps":6000},{"position":2,"percentage_bps":4000}]'::jsonb
  )$sql$,
  'authenticated user creates a league atomically'
);
select lives_ok(
  $sql$select public.create_league(
    '26000000-0000-4000-8000-000000000027',
    'ליגת א מותאמת',
    null,
    0,
    null,
    null::timestamptz,
    false,
    10::smallint,
    4::smallint,
    2::smallint,
    '[{"position":1,"percentage_bps":10000}]'::jsonb
  )$sql$,
  'the same user can create a league with custom scoring'
);

select results_eq(
  $$select name from public.competitions order by name$$,
  array['ליגת העל הישראלית']::text[],
  'authenticated reads the competition catalog'
);
select throws_ok(
  $$insert into public.competitions (name, slug, country_code) values ('זרה', 'foreign', 'IL')$$,
  '42501', null,
  'authenticated cannot insert catalog data'
);
reset role;

select is(
  (select count(*)::integer from public.leagues where manager_id = 'a0000000-0000-4000-8000-000000000001'),
  2,
  'both leagues were created for user A'
);
select is(
  (select manager_id from public.leagues where name = 'ליגת א הראשונה'),
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'the RPC derives manager_id from auth.uid()'
);
select is(
  (select description from public.leagues where name = 'ליגת א הראשונה'),
  'תיאור בדיקה',
  'the RPC trims league text before storage'
);
select is(
  (select count(*)::integer
   from public.league_members
   join public.leagues on public.leagues.id = public.league_members.league_id
   where public.leagues.name = 'ליגת א הראשונה'
     and public.league_members.user_id = public.leagues.manager_id
     and public.league_members.status = 'active'),
  1,
  'the creator is one active member and the manager'
);
select is(
  (select version from public.league_scoring_rules
   join public.leagues on public.leagues.id = public.league_scoring_rules.league_id
   where public.leagues.name = 'ליגת א הראשונה'),
  1,
  'new scoring rules start at version 1'
);
select is(
  (select sum(percentage_bps)::integer
   from public.prize_rules
   join public.leagues on public.leagues.id = public.prize_rules.league_id
   where public.leagues.name = 'ליגת א הראשונה'),
  10000,
  'created prize rows total exactly 10000 basis points'
);
select results_eq(
  $$select exact_points::integer
    from public.league_scoring_rules
    join public.leagues on public.leagues.id = public.league_scoring_rules.league_id
    where public.leagues.manager_id = 'a0000000-0000-4000-8000-000000000001'
    order by public.leagues.name$$,
  array[3, 10]::integer[],
  'custom scoring remains isolated between two leagues'
);

-- Invalid function input leaves every participating table unchanged.
create temp table league_counts_before_invalid as
select
  (select count(*) from public.leagues) as leagues,
  (select count(*) from public.league_scoring_rules) as scoring,
  (select count(*) from public.prize_rules) as prizes,
  (select count(*) from public.league_members) as members;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $sql$select public.create_league(
    'ffffffff-ffff-4fff-8fff-ffffffffffff', 'עונה לא תקינה', null, 0, null,
    null::timestamptz, true, 3::smallint, 1::smallint, 0::smallint, '[{"position":1,"percentage_bps":10000}]'::jsonb
  )$sql$,
  'P0001', 'INVALID_SEASON',
  'invalid season is rejected'
);
select throws_ok(
  $sql$select public.create_league(
    '26000000-0000-4000-8000-000000000027', 'ניקוד לא תקין', null, 0, null,
    null::timestamptz, true, 1::smallint, 3::smallint, 0::smallint, '[{"position":1,"percentage_bps":10000}]'::jsonb
  )$sql$,
  'P0001', 'INVALID_SCORING_RULES',
  'invalid scoring is rejected'
);
select throws_ok(
  $sql$select public.create_league(
    '26000000-0000-4000-8000-000000000027', 'פרסים לא תקינים', null, 0, null,
    null::timestamptz, true, 3::smallint, 1::smallint, 0::smallint, '[{"position":1,"percentage_bps":5000}]'::jsonb
  )$sql$,
  'P0001', 'INVALID_PRIZE_RULES',
  'a prize total below 10000 is rejected'
);
select throws_ok(
  $sql$select public.create_league(
    '26000000-0000-4000-8000-000000000027', 'מיקומים לא תקינים', null, 0, null,
    null::timestamptz, true, 3::smallint, 1::smallint, 0::smallint,
    '[{"position":1,"percentage_bps":5000},{"position":3,"percentage_bps":5000}]'::jsonb
  )$sql$,
  'P0001', 'INVALID_PRIZE_RULES',
  'non-consecutive prize positions are rejected'
);
reset role;

select is(
  (select count(*) from public.leagues),
  (select leagues from league_counts_before_invalid),
  'invalid RPC calls leave no league behind'
);
select is(
  (select count(*) from public.league_scoring_rules),
  (select scoring from league_counts_before_invalid),
  'invalid RPC calls leave no scoring row behind'
);
select is(
  (select count(*) from public.prize_rules),
  (select prizes from league_counts_before_invalid),
  'invalid RPC calls leave no prize row behind'
);
select is(
  (select count(*) from public.league_members),
  (select members from league_counts_before_invalid),
  'invalid RPC calls leave no membership behind'
);

-- User A can read their league; unrelated user B cannot read or mutate it.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is((select count(*)::integer from public.leagues), 2, 'user A reads their two leagues');
select is((select count(*)::integer from public.league_scoring_rules), 2, 'user A reads their scoring rules');
select is((select count(*)::integer from public.prize_rules), 3, 'user A reads their prize rows');
select is((select count(*)::integer from public.league_members), 2, 'user A reads active memberships without recursion');
select lives_ok(
  $$select id, display_name from public.profiles order by id$$,
  'authorized profile policy evaluates without recursive RLS'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is((select count(*)::integer from public.leagues), 0, 'user B cannot read user A leagues');
select is((select count(*)::integer from public.league_scoring_rules), 0, 'user B cannot read user A scoring rules');
select is((select count(*)::integer from public.prize_rules), 0, 'user B cannot read user A prize rules');
select is((select count(*)::integer from public.league_members), 0, 'user B cannot read user A membership');
select throws_ok(
  $$update public.leagues set name = 'ניסיון שינוי'$$,
  '42501', null,
  'user B cannot directly update a league'
);
select throws_ok(
  $$insert into public.prize_rules (league_id, position, percentage_bps)
    values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 1, 10000)$$,
  '42501', null,
  'user B cannot directly insert league-domain data'
);
select results_eq(
  $$select display_name from public.profiles order by display_name$$,
  array['משתמש ב']::text[],
  'an unrelated user still reads only their own profile'
);
reset role;

-- Add one authorized active peer as a future workflow would; profile visibility expands only to that peer.
insert into public.league_members (league_id, user_id, status, approved_by)
select id,
       'c0000000-0000-4000-8000-000000000003',
       'active',
       'a0000000-0000-4000-8000-000000000001'
from public.leagues
where name = 'ליגת א הראשונה';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  $$select id from public.profiles order by id$$,
  array[
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'c0000000-0000-4000-8000-000000000003'::uuid
  ],
  'profile sharing includes an authorized active shared-league profile only'
);
select is(
  (select count(*)::integer from public.league_members
   where league_id = (select id from public.leagues where name = 'ליגת א הראשונה')),
  2,
  'active members can read allowed membership data in their league'
);
reset role;

-- Scoring changes are versioned before start, then rejected at lock/database kickoff time.
update public.league_scoring_rules
set exact_points = 4
where league_id = (select id from public.leagues where name = 'ליגת א הראשונה');
select is(
  (select version from public.league_scoring_rules
   where league_id = (select id from public.leagues where name = 'ליגת א הראשונה')),
  2,
  'an allowed pre-start scoring change advances the version'
);

update public.league_scoring_rules
set locked_at = now()
where league_id = (select id from public.leagues where name = 'ליגת א מותאמת');
select throws_ok(
  $$update public.league_scoring_rules
    set exact_points = 11
    where league_id = (select id from public.leagues where name = 'ליגת א מותאמת')$$,
  'P0001', 'SCORING_RULES_LOCKED',
  'explicitly locked scoring rules cannot change'
);

insert into public.teams (id, name)
values
  ('d0000000-0000-4000-8000-000000000001', 'קבוצת בית'),
  ('d0000000-0000-4000-8000-000000000002', 'קבוצת חוץ');
insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at
)
values (
  'e0000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000027',
  1,
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  now() + interval '1 day'
);

update public.league_scoring_rules
set exact_points = 5
where league_id = (select id from public.leagues where name = 'ליגת א הראשונה');
select is(
  (select version from public.league_scoring_rules
   where league_id = (select id from public.leagues where name = 'ליגת א הראשונה')),
  3,
  'rules remain editable before the first season kickoff and version again'
);

update public.matches
set kickoff_at = now()
where id = 'e0000000-0000-4000-8000-000000000001';
select throws_ok(
  $$update public.league_scoring_rules
    set exact_points = 6
    where league_id = (select id from public.leagues where name = 'ליגת א הראשונה')$$,
  'P0001', 'SCORING_RULES_LOCKED',
  'database time at the first kickoff locks scoring changes'
);
select throws_ok(
  $$update public.league_scoring_rules
    set version = version + 1
    where league_id = (select id from public.leagues where name = 'ליגת א הראשונה')$$,
  'P0001', 'SCORING_RULE_VERSION_INVALID',
  'the scoring version cannot be changed without rule values'
);

set constraints prize_rules_validate_total immediate;
select throws_ok(
  $$delete from public.prize_rules
    where league_id = (select id from public.leagues where name = 'ליגת א הראשונה')
      and position = 2$$,
  'P0001', 'INVALID_PRIZE_RULES',
  'the deferred database invariant rejects a partial prize allocation'
);
select is(
  (select sum(percentage_bps)::integer from public.prize_rules
   where league_id = (select id from public.leagues where name = 'ליגת א הראשונה')),
  10000,
  'a rejected prize mutation leaves the valid allocation intact'
);
set constraints prize_rules_validate_total deferred;

select * from finish();
rollback;
