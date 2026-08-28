-- A review resolver must not discover season leagues before a concurrent
-- creator commits and then let score_match observe that phantom later. These
-- dblink sessions reproduce creator -> resolver -> completion ordering.
begin;

select no_plan();

create extension if not exists dblink with schema extensions;

create function pg_temp.wait_for_advisory_lock(
  p_backend_pid integer,
  p_classid oid,
  p_objid oid,
  p_objsubid smallint,
  p_granted boolean
)
returns boolean
language plpgsql
as $$
declare
  v_attempt integer := 0;
begin
  loop
    if exists (
      select 1
      from pg_catalog.pg_locks as held
      where held.pid = p_backend_pid
        and held.locktype = 'advisory'
        and held.classid = p_classid
        and held.objid = p_objid
        and held.objsubid = p_objsubid
        and held.granted = p_granted
    ) then
      return true;
    end if;

    v_attempt := v_attempt + 1;
    if v_attempt >= 500 then
      return false;
    end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
end;
$$;

select ok(
  (
    select prosecdef and proconfig @> array['search_path=""']
    from pg_proc
    where oid = 'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)'::regprocedure
  )
  and has_function_privilege(
    'service_role',
    'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)',
    'EXECUTE'
  ),
  'review resolution keeps its hardened service-only boundary'
);

select is(
  extensions.dblink_connect(
    'review_registry_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the registry-race control connection opens'
);
select is(
  extensions.dblink_connect(
    'review_registry_creator',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the registry-race creator connection opens'
);
select is(
  extensions.dblink_connect(
    'review_registry_locker',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the registry-race existing-league locker opens'
);
select is(
  extensions.dblink_connect(
    'review_registry_resolver',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the registry-race resolver connection opens'
);
select is(
  extensions.dblink_connect(
    'review_registry_completion',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the registry-race completion connection opens'
);

select is(
  extensions.dblink_exec('review_registry_control', $remote$
    delete from public.audit_logs
    where entity_id between
      'd9910000-0000-4000-8000-000000000200'::uuid and
      'd9910000-0000-4000-8000-000000000499'::uuid;
    delete from public.predictions
    where league_id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_match_reconciliations
    where league_id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_match_snapshots
    where league_id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_members
    where league_id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.prize_rules
    where league_id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_scoring_rules
    where league_id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.leagues
    where id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.match_result_reviews
    where match_id = 'd9910000-0000-4000-8000-000000000201';
    delete from public.matches
    where id = 'd9910000-0000-4000-8000-000000000201';
    delete from public.seasons
    where id = 'd9910000-0000-4000-8000-000000000101';
    delete from public.teams
    where id in (
      'd9910000-0000-4000-8000-000000000111',
      'd9910000-0000-4000-8000-000000000112'
    );
    delete from public.competitions
    where id = 'd9910000-0000-4000-8000-000000000100';
    delete from auth.users
    where id in (
      'd9910000-0000-4000-8000-000000000001',
      'd9910000-0000-4000-8000-000000000002'
    );

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values
      (
        '00000000-0000-0000-0000-000000000000',
        'd9910000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated',
        'review-registry-manager@example.com',
        extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
        now(), '{"provider":"email","providers":["email"]}',
        '{"display_name":"Review Registry Manager"}', now(), now()
      ),
      (
        '00000000-0000-0000-0000-000000000000',
        'd9910000-0000-4000-8000-000000000002',
        'authenticated', 'authenticated',
        'review-registry-member@example.com',
        extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
        now(), '{"provider":"email","providers":["email"]}',
        '{"display_name":"Review Registry Member"}', now(), now()
      );

    insert into public.competitions (
      id, name, slug, country_code
    ) values (
      'd9910000-0000-4000-8000-000000000100',
      'Review registry competition', 'review-registry-competition', 'IL'
    );
    insert into public.seasons (
      id, competition_id, name, starts_on, ends_on, is_current
    ) values (
      'd9910000-0000-4000-8000-000000000101',
      'd9910000-0000-4000-8000-000000000100',
      'Review registry season', '2026-01-01', '2026-12-31', false
    );
    insert into public.teams (id, name, short_name) values
      (
        'd9910000-0000-4000-8000-000000000111',
        'Review registry home', 'Registry home'
      ),
      (
        'd9910000-0000-4000-8000-000000000112',
        'Review registry away', 'Registry away'
      );
    insert into public.matches (
      id, season_id, round_number, home_team_id, away_team_id,
      kickoff_at, status, provider_status, predictions_locked_at,
      result_version, requires_review, review_code, review_result_version
    ) values (
      'd9910000-0000-4000-8000-000000000201',
      'd9910000-0000-4000-8000-000000000101', 1,
      'd9910000-0000-4000-8000-000000000111',
      'd9910000-0000-4000-8000-000000000112',
      clock_timestamp() - interval '1 hour', 'scheduled', 'AET',
      clock_timestamp() - interval '1 hour', 0, true,
      'AET_REQUIRES_REVIEW', 0
    );
    insert into public.match_result_reviews (
      match_id, result_version, provider_status
    ) values (
      'd9910000-0000-4000-8000-000000000201', 0, 'AET'
    );
    insert into public.leagues (
      id, manager_id, season_id, name, status, activated_at
    ) values (
      'd9910000-0000-4000-8000-000000000303',
      'd9910000-0000-4000-8000-000000000001',
      'd9910000-0000-4000-8000-000000000101',
      'Committed registry league', 'active',
      clock_timestamp() - interval '1 day'
    );
    insert into public.league_scoring_rules (league_id, locked_at)
    values (
      'd9910000-0000-4000-8000-000000000303',
      clock_timestamp() - interval '1 day'
    );
  $remote$),
  'INSERT 0 1',
  'the committed registry-race base fixture is isolated'
);

select is(
  extensions.dblink_exec('review_registry_creator', $remote$
    begin;
    do $block$
    begin
      perform pg_catalog.pg_advisory_xact_lock_shared(2026090609);
    end
    $block$;
    insert into public.leagues (
      id, manager_id, season_id, name, status, activated_at
    ) values (
      'd9910000-0000-4000-8000-000000000301',
      'd9910000-0000-4000-8000-000000000001',
      'd9910000-0000-4000-8000-000000000101',
      'Uncommitted registry league', 'active',
      clock_timestamp() - interval '1 day'
    );
    insert into public.league_scoring_rules (league_id, locked_at)
    values (
      'd9910000-0000-4000-8000-000000000301',
      clock_timestamp() - interval '1 day'
    );
    insert into public.league_members (
      league_id, user_id, status, approved_by, approved_at
    ) values (
      'd9910000-0000-4000-8000-000000000301',
      'd9910000-0000-4000-8000-000000000002', 'active',
      'd9910000-0000-4000-8000-000000000001',
      clock_timestamp() - interval '1 day'
    );
    insert into public.predictions (
      league_id, match_id, user_id,
      predicted_home_score, predicted_away_score
    ) values (
      'd9910000-0000-4000-8000-000000000301',
      'd9910000-0000-4000-8000-000000000201',
      'd9910000-0000-4000-8000-000000000002', 2, 1
    );
  $remote$),
  'INSERT 0 1',
  'a league creator holds the shared registry barrier before commit'
);

select is(
  extensions.dblink_exec('review_registry_locker', $remote$
    begin;
    do $block$
    begin
      perform pg_catalog.pg_advisory_xact_lock(
        2026090609,
        pg_catalog.hashtext('d9910000-0000-4000-8000-000000000303')
      );
    end
    $block$;
  $remote$),
  'DO',
  'the committed league key is held after the registry creator entered'
);

select is(
  extensions.dblink_exec('review_registry_resolver', $remote$
    set statement_timeout = '15s';
    set lock_timeout = '10s';
    set role service_role;
    set request.headers =
      '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}';
    create function pg_temp.resolve_registry_review()
    returns text
    language plpgsql
    as $function$
    declare v_result record;
    begin
      select * into v_result
      from public.resolve_match_result_review(
        'd9910000-0000-4000-8000-000000000201',
        0, 'finished', 2, 1
      );
      return 'RESOLVED:' || v_result.result_predictions_scored;
    exception when others then
      return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end
    $function$;
  $remote$),
  'CREATE FUNCTION',
  'the resolver session has one fixed review operation'
);

select is(
  extensions.dblink_exec('review_registry_completion', $remote$
    set statement_timeout = '15s';
    set lock_timeout = '10s';
    set role authenticated;
    set request.jwt.claims =
      '{"sub":"d9910000-0000-4000-8000-000000000001","role":"authenticated"}';
    create function pg_temp.complete_registry_league()
    returns text
    language plpgsql
    as $function$
    declare v_result record;
    begin
      select * into v_result
      from public.complete_league(
        'd9910000-0000-4000-8000-000000000301'
      );
      return 'COMPLETED:' || v_result.result_status::text;
    exception when others then
      return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end
    $function$;
  $remote$),
  'CREATE FUNCTION',
  'the completion session has one fixed league operation'
);

create temp table review_registry_pids as
select 'resolver'::text as caller, pid
from extensions.dblink(
  'review_registry_resolver', 'select pg_backend_pid()'
) as result(pid integer)
union all
select 'completion', pid
from extensions.dblink(
  'review_registry_completion', 'select pg_backend_pid()'
) as result(pid integer);

select is(
  extensions.dblink_send_query(
    'review_registry_resolver',
    'select pg_temp.resolve_registry_review()'
  ),
  1,
  'review resolution starts while league creation is uncommitted'
);
select ok(
  pg_temp.wait_for_advisory_lock(
    (select pid from review_registry_pids where caller = 'resolver'),
    0::oid,
    2026090609::oid,
    1::smallint,
    false
  ),
  'the resolver waits on the exclusive registry barrier before discovery'
);

select is(
  extensions.dblink_exec('review_registry_creator', 'commit'),
  'COMMIT',
  'the new league commits while the resolver is queued at discovery'
);
select ok(
  pg_temp.wait_for_advisory_lock(
    (select pid from review_registry_pids where caller = 'resolver'),
    2026090609::oid,
    pg_catalog.hashtext('d9910000-0000-4000-8000-000000000301')::oid,
    2::smallint,
    true
  ),
  'after discovery the resolver holds the newly committed league key'
);
select ok(
  pg_temp.wait_for_advisory_lock(
    (select pid from review_registry_pids where caller = 'resolver'),
    2026090609::oid,
    pg_catalog.hashtext('d9910000-0000-4000-8000-000000000303')::oid,
    2::smallint,
    false
  ),
  'the resolver then waits on the previously committed league key'
);

select is(
  extensions.dblink_send_query(
    'review_registry_completion',
    'select pg_temp.complete_registry_league()'
  ),
  1,
  'completion starts for the newly committed league'
);
select ok(
  pg_temp.wait_for_advisory_lock(
    (select pid from review_registry_pids where caller = 'completion'),
    2026090609::oid,
    pg_catalog.hashtext('d9910000-0000-4000-8000-000000000301')::oid,
    2::smallint,
    false
  ),
  'completion shares the new league key and cannot freeze half-scored state'
);

select is(
  extensions.dblink_exec('review_registry_locker', 'commit'),
  'COMMIT',
  'the existing league key is released after both wait relationships are proven'
);

create temp table review_registry_results(caller text, value text);
insert into review_registry_results
select 'resolver', value
from extensions.dblink_get_result(
  'review_registry_resolver'
) as result(value text);
insert into review_registry_results
select 'completion', value
from extensions.dblink_get_result(
  'review_registry_completion'
) as result(value text);

select results_eq(
  $$select caller, value from review_registry_results order by caller$$,
  $$values
    ('completion'::text, 'COMPLETED:completed'::text),
    ('resolver'::text, 'RESOLVED:1'::text)$$,
  'review scoring commits before the queued completion freezes the league'
);
select results_eq(
  $$select league.status::text, prediction.points,
           prediction.scored_result_version,
           snapshot.completed_result_version
    from public.leagues as league
    join public.predictions as prediction on prediction.league_id = league.id
    join public.league_match_snapshots as snapshot
      on snapshot.league_id = league.id
     and snapshot.match_id = prediction.match_id
    where league.id = 'd9910000-0000-4000-8000-000000000301'$$,
  $$values ('completed'::text, 3::smallint, 1, 1)$$,
  'the completed snapshot and prediction share the fully applied result version'
);

select is(
  extensions.dblink_disconnect('review_registry_completion'),
  'OK',
  'the completion connection disconnects'
);
select is(
  extensions.dblink_disconnect('review_registry_resolver'),
  'OK',
  'the resolver connection disconnects'
);
select is(
  extensions.dblink_disconnect('review_registry_locker'),
  'OK',
  'the existing-league locker disconnects'
);
select is(
  extensions.dblink_disconnect('review_registry_creator'),
  'OK',
  'the creator connection disconnects'
);

select is(
  extensions.dblink_exec('review_registry_control', $remote$
    delete from public.audit_logs
    where entity_id between
      'd9910000-0000-4000-8000-000000000200'::uuid and
      'd9910000-0000-4000-8000-000000000499'::uuid;
    delete from public.predictions
    where league_id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_match_reconciliations
    where league_id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_match_snapshots
    where league_id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_members
    where league_id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.prize_rules
    where league_id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.league_scoring_rules
    where league_id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.leagues
    where id between
      'd9910000-0000-4000-8000-000000000300'::uuid and
      'd9910000-0000-4000-8000-000000000399'::uuid;
    delete from public.match_result_reviews
    where match_id = 'd9910000-0000-4000-8000-000000000201';
    delete from public.matches
    where id = 'd9910000-0000-4000-8000-000000000201';
    delete from public.seasons
    where id = 'd9910000-0000-4000-8000-000000000101';
    delete from public.teams
    where id in (
      'd9910000-0000-4000-8000-000000000111',
      'd9910000-0000-4000-8000-000000000112'
    );
    delete from public.competitions
    where id = 'd9910000-0000-4000-8000-000000000100';
    delete from auth.users
    where id in (
      'd9910000-0000-4000-8000-000000000001',
      'd9910000-0000-4000-8000-000000000002'
    );
  $remote$),
  'DELETE 2',
  'the committed registry-race fixture is removed'
);
select is(
  extensions.dblink_disconnect('review_registry_control'),
  'OK',
  'the registry-race control connection disconnects'
);

select * from finish();
rollback;
