begin;

select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'de000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'manual-lifecycle@example.com',
  extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Manual Lifecycle Manager"}', now(), now()
);

insert into public.system_admins (user_id, granted_by)
values (
  'de000000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001'
);

insert into public.seasons (
  id, competition_id, name, starts_on, ends_on, is_current
) values (
  'de000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000001',
  'Manual Lifecycle Product', '2026-01-01', '2026-12-31', false
);

insert into public.leagues (
  id, manager_id, season_id, name, status, activated_at
) values (
  'de000000-0000-4000-8000-000000000201',
  'de000000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000101',
  'Manual Lifecycle Product', 'active', clock_timestamp() - interval '1 hour'
);

insert into public.league_scoring_rules (league_id, locked_at)
values (
  'de000000-0000-4000-8000-000000000201',
  clock_timestamp() - interval '1 hour'
);

insert into public.league_members (league_id, user_id, approved_by, approved_at)
values (
  'de000000-0000-4000-8000-000000000201',
  'de000000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001',
  clock_timestamp() - interval '1 hour'
);

insert into public.matches (
  id, season_id, round_number, home_team_id, away_team_id,
  kickoff_at, status
) values (
  'de000000-0000-4000-8000-000000000301',
  'de000000-0000-4000-8000-000000000101', 1,
  '26000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000102',
  clock_timestamp() - interval '30 minutes', 'scheduled'
);

insert into public.predictions (
  league_id, match_id, user_id, predicted_home_score, predicted_away_score
) values (
  'de000000-0000-4000-8000-000000000201',
  'de000000-0000-4000-8000-000000000301',
  'de000000-0000-4000-8000-000000000001', 2, 1
);

create temp table product_manual_input as
select kickoff_at
from public.matches
where id = 'de000000-0000-4000-8000-000000000301';
grant select on table product_manual_input to service_role;

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"de000000-0000-4000-8000-000000000001"}',
  true
);
create temp table product_manual_result as
select * from public.create_or_correct_match(
  'correct',
  'de000000-0000-4000-8000-000000000301',
  'de000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000101',
  '26000000-0000-4000-8000-000000000102',
  1,
  (select kickoff_at from product_manual_input),
  'finished', 2, 1
);
reset role;

select results_eq(
  $$select result_status::text, result_version, result_changed
    from product_manual_result$$,
  $$values ('finished'::text, 1, true)$$,
  'the product Manual editor persists a terminal result'
);

select is(
  (select count(*)::integer
   from public.audit_logs
   where entity_id = 'de000000-0000-4000-8000-000000000301'
     and action = 'match_manually_corrected'
     and metadata ->> 'result_version' = '1'),
  1,
  'the product Manual terminal result records the versioned completion decision'
);

select results_eq(
  $$select points, is_exact, is_correct_outcome,
           scored_result_version, scored_rule_version
    from public.predictions
    where league_id = 'de000000-0000-4000-8000-000000000201'$$,
  $$values (3::smallint, true, true, 1, 1)$$,
  'the product Manual result deterministically scores the prediction'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"de000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
create temp table product_completion as
select * from public.complete_league(
  'de000000-0000-4000-8000-000000000201'
);
reset role;

select results_eq(
  $$select result_status::text, result_snapshot_count, result_changed
    from product_completion$$,
  $$values ('completed'::text, 1, true)$$,
  'the same product-entered terminal result passes the completion gate'
);

select is(
  (select count(*)::integer
   from public.league_match_snapshots
   where league_id = 'de000000-0000-4000-8000-000000000201'
     and completed_result_version = 1),
  1,
  'completion freezes the product-entered result version'
);

select * from finish();
rollback;
