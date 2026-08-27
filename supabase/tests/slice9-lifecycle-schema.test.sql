begin;

select no_plan();

select ok(
  to_regclass('public.match_result_reviews') is not null
  and to_regclass('public.league_match_snapshots') is not null
  and to_regclass('public.league_match_reconciliations') is not null,
  'Slice 9 lifecycle persistence tables exist'
);

select ok(
  (
    select count(*) = 3
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name in (
        'requires_review', 'review_code', 'review_result_version'
      )
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.matches'::regclass
      and conname = 'matches_review_shape_check'
      and contype = 'c'
      and convalidated
  ),
  'matches has a validated all-or-none durable review gate'
);

select ok(
  (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'public.match_result_reviews'::regclass,
      'public.league_match_snapshots'::regclass,
      'public.league_match_reconciliations'::regclass
    )
  ),
  'every new exposed lifecycle table enables RLS in its creation migration'
);

select ok(
  has_table_privilege(
    'authenticated', 'public.match_result_reviews', 'SELECT'
  )
  and has_table_privilege(
    'authenticated', 'public.league_match_snapshots', 'SELECT'
  )
  and has_table_privilege(
    'authenticated', 'public.league_match_reconciliations', 'SELECT'
  )
  and not has_table_privilege(
    'authenticated', 'public.match_result_reviews', 'INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated', 'public.league_match_snapshots', 'INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.league_match_reconciliations',
    'INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'anon', 'public.match_result_reviews', 'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'anon', 'public.league_match_snapshots', 'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'anon',
    'public.league_match_reconciliations',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'service_role',
    'public.match_result_reviews',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'service_role',
    'public.league_match_snapshots',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'service_role',
    'public.league_match_reconciliations',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'least-privilege grants allow authenticated reads only and no direct writes'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.league_match_reconciliations'::regclass
      and conname = 'league_match_reconciliations_snapshot_fkey'
      and contype = 'f'
      and convalidated
  ),
  'reconciliation has a validated composite FK to the frozen included set'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'da000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'lifecycle-manager@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Lifecycle Manager"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'da000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'lifecycle-member@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Lifecycle Member"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'da000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'lifecycle-outsider@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Lifecycle Outsider"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'da000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'lifecycle-admin@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Lifecycle Admin"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'da000000-0000-4000-8000-000000000005',
    'authenticated', 'authenticated', 'lifecycle-foreign-manager@example.com',
    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Lifecycle Foreign Manager"}', now(), now()
  );

insert into public.system_admins (user_id, granted_by)
values (
  'da000000-0000-4000-8000-000000000004',
  'da000000-0000-4000-8000-000000000004'
);

insert into public.seasons (
  id, competition_id, name, starts_on, ends_on, is_current
)
values (
  'da000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000001',
  'Lifecycle Schema Season', '2026-01-01', '2026-12-31', false
);

insert into public.leagues (id, manager_id, season_id, name, status)
values
  (
    'da000000-0000-4000-8000-000000000201',
    'da000000-0000-4000-8000-000000000001',
    'da000000-0000-4000-8000-000000000101',
    'Lifecycle Main League', 'completed'
  ),
  (
    'da000000-0000-4000-8000-000000000202',
    'da000000-0000-4000-8000-000000000005',
    'da000000-0000-4000-8000-000000000101',
    'Lifecycle Foreign League', 'completed'
  );

insert into public.league_members (league_id, user_id, approved_by)
values (
  'da000000-0000-4000-8000-000000000201',
  'da000000-0000-4000-8000-000000000002',
  'da000000-0000-4000-8000-000000000001'
);

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id, kickoff_at,
  status, home_score, away_score, result_version, provider_status
)
values
  (
    'da000000-0000-4000-8000-000000000301',
    'da000000-0000-4000-8000-000000000101', 1,
    '26000000-0000-4000-8000-000000000101',
    '26000000-0000-4000-8000-000000000102',
    '2026-02-01T18:00:00Z', 'finished', 2, 1, 2, 'FT'
  ),
  (
    'da000000-0000-4000-8000-000000000302',
    'da000000-0000-4000-8000-000000000101', 2,
    '26000000-0000-4000-8000-000000000103',
    '26000000-0000-4000-8000-000000000104',
    '2026-02-08T18:00:00Z', 'finished', 1, 1, 1, 'AET'
  );

insert into public.league_match_snapshots (
  league_id, match_id, completed_status, completed_home_score,
  completed_away_score, completed_result_version, completed_at
)
values
  (
    'da000000-0000-4000-8000-000000000201',
    'da000000-0000-4000-8000-000000000301',
    'finished', 2, 1, 2, '2026-02-02T00:00:00Z'
  ),
  (
    'da000000-0000-4000-8000-000000000202',
    'da000000-0000-4000-8000-000000000301',
    'finished', 2, 1, 2, '2026-02-02T00:00:00Z'
  );

insert into public.match_result_reviews (
  match_id, result_version, provider_status,
  candidate_home_score, candidate_away_score
)
values (
  'da000000-0000-4000-8000-000000000302', 1, 'AET', 1, 1
);

insert into public.league_match_reconciliations (
  id, league_id, match_id, result_version, candidate_status,
  candidate_home_score, candidate_away_score, created_by
)
values (
  'da000000-0000-4000-8000-000000000401',
  'da000000-0000-4000-8000-000000000201',
  'da000000-0000-4000-8000-000000000301',
  3, 'finished', 0, 1,
  'da000000-0000-4000-8000-000000000004'
);

select throws_ok(
  $$update public.matches
    set requires_review = true
    where id = 'da000000-0000-4000-8000-000000000302'$$,
  '23514', null,
  'a match cannot expose a half-populated review gate'
);

select throws_ok(
  $$insert into public.league_match_snapshots (
      league_id, match_id, completed_status, completed_result_version,
      completed_at
    ) values (
      'da000000-0000-4000-8000-000000000201',
      'da000000-0000-4000-8000-000000000302',
      'scheduled', 1, clock_timestamp()
    )$$,
  '23514', null,
  'a nonterminal match cannot enter the frozen completed set'
);

select throws_ok(
  $$update public.match_result_reviews
    set disposition = 'resolved', selected_status = 'finished',
        selected_home_score = 1, selected_away_score = 1,
        applied_result_version = 2
    where match_id = 'da000000-0000-4000-8000-000000000302'
      and result_version = 1$$,
  '23514', null,
  'a resolved review requires actor and decision time metadata'
);

select throws_ok(
  $$insert into public.league_match_reconciliations (
      league_id, match_id, result_version, candidate_status,
      candidate_home_score, candidate_away_score, created_by
    ) values (
      'da000000-0000-4000-8000-000000000201',
      'da000000-0000-4000-8000-000000000302',
      2, 'finished', 1, 1,
      'da000000-0000-4000-8000-000000000004'
    )$$,
  '23503', null,
  'a fixture absent from the frozen snapshot cannot enter reconciliation'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"da000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  $$select league_id from public.league_match_snapshots order by league_id$$,
  $$values ('da000000-0000-4000-8000-000000000201'::uuid)$$,
  'a manager reads only their league frozen snapshot through RLS'
);
select is(
  (select count(*)::integer from public.match_result_reviews), 0,
  'a league manager cannot read system-admin match reviews'
);
select is(
  (select count(*)::integer from public.league_match_reconciliations), 0,
  'a league manager cannot read completed-league reconciliation rows'
);
select throws_ok(
  $$insert into public.league_match_snapshots (
      league_id, match_id, completed_status, completed_home_score,
      completed_away_score, completed_result_version, completed_at
    ) values (
      'da000000-0000-4000-8000-000000000201',
      'da000000-0000-4000-8000-000000000302',
      'finished', 1, 1, 1, clock_timestamp()
    )$$,
  '42501', null,
  'an authenticated manager cannot mutate snapshots directly'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"da000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.league_match_snapshots), 1,
  'an active member can read their completed league snapshot'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"da000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.league_match_snapshots), 0,
  'an outsider cannot read another league snapshot'
);
select is(
  (select count(*)::integer from public.match_result_reviews), 0,
  'an outsider cannot read result reviews'
);
select is(
  (select count(*)::integer from public.league_match_reconciliations), 0,
  'an outsider cannot read reconciliation rows'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"da000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.match_result_reviews), 1,
  'a system administrator can read the durable result-review queue'
);
select is(
  (select count(*)::integer from public.league_match_reconciliations), 1,
  'a system administrator can read the completed-league reconciliation queue'
);
select throws_ok(
  $$update public.league_match_reconciliations
    set disposition = 'dismissed'
    where id = 'da000000-0000-4000-8000-000000000401'$$,
  '42501', null,
  'a system administrator still cannot bypass the future mutation RPC'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select * from public.league_match_snapshots$$,
  '42501', null,
  'anonymous callers have no lifecycle table access'
);
reset role;

select * from finish();
rollback;
