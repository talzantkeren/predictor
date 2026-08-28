-- League-scoped lifecycle serialization. A successful prediction save keeps
-- its transaction open in league A; the same-league waiter must block while a
-- save in unrelated league B must finish before A commits.

begin;

select no_plan();

create extension if not exists dblink with schema extensions;

select ok(
  to_regprocedure('private.slice9_lock_leagues(uuid[])') is not null
  and not has_function_privilege(
    'authenticated', 'private.slice9_lock_leagues(uuid[])', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'private.slice9_lock_leagues(uuid[])', 'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'private.slice9_lock_leagues(uuid[])', 'EXECUTE'
  ),
  'the ordered league-lock helper is private to database-owned boundaries'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.approve_join_request(uuid)'::regprocedure,
      'public.reject_join_request(uuid,text)'::regprocedure,
      'public.finalize_payment_proof(uuid,uuid,uuid,text,integer)'::regprocedure,
      'public.save_prediction(uuid,uuid,numeric,numeric)'::regprocedure,
      'public.create_or_rotate_invite(uuid)'::regprocedure,
      'public.revoke_invite(uuid)'::regprocedure,
      'public.submit_join_request(uuid,text)'::regprocedure,
      'public.complete_league(uuid)'::regprocedure
    ]) as boundary(oid)
    where lower(pg_get_functiondef(boundary.oid)) ~
      'pg_advisory_xact_lock\([[:space:]]*2026090609[[:space:]]*,'
      and lower(pg_get_functiondef(boundary.oid)) like
        '%pg_catalog.hashtext%'
      and lower(pg_get_functiondef(boundary.oid)) !~
        'pg_advisory_xact_lock\([[:space:]]*2026090609[[:space:]]*\)'
  ),
  8,
  'all eight lifecycle wrappers use the two-part league advisory key only'
);

select ok(
  lower(pg_get_functiondef(
    'private.slice9_complete_league_without_activation_guard(uuid)'::regprocedure
  )) !~ 'pg_advisory_xact_lock\([[:space:]]*2026090609[[:space:]]*\)',
  'the completion delegate no longer re-enters the historical global mutex'
);

select ok(
  position(
    'pg_advisory_xact_lock_shared(2026090609)'
    in lower(pg_get_functiondef(
      'public.create_league(uuid,text,text,integer,text,timestamp with time zone,boolean,smallint,smallint,smallint,jsonb)'::regprocedure
    ))
  ) > 0
  and position(
    'pg_advisory_xact_lock(2026090609);'
    in lower(pg_get_functiondef(
      'public.apply_api_football_sync_batch(uuid,bigint,uuid,jsonb)'::regprocedure
    ))
  ) < position(
    'private.slice9_lock_leagues'
    in lower(pg_get_functiondef(
      'public.apply_api_football_sync_batch(uuid,bigint,uuid,jsonb)'::regprocedure
    ))
  )
  and position(
    'pg_advisory_xact_lock(2026090609);'
    in lower(pg_get_functiondef(
      'public.create_or_correct_match(text,uuid,uuid,uuid,uuid,numeric,timestamp with time zone,public.match_status,numeric,numeric)'::regprocedure
    ))
  ) < position(
    'private.slice9_lock_leagues'
    in lower(pg_get_functiondef(
      'public.create_or_correct_match(text,uuid,uuid,uuid,uuid,numeric,timestamp with time zone,public.match_status,numeric,numeric)'::regprocedure
    ))
  ),
  'catalog writers enter the registry barrier before league discovery and keyed exclusion'
);

select ok(
  position(
    'pg_advisory_xact_lock(2026090609);'
    in lower(pg_get_functiondef(
      'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)'::regprocedure
    ))
  ) > 0
  and position(
    'from public.leagues as league'
    in lower(pg_get_functiondef(
      'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)'::regprocedure
    ))
  ) > 0
  and position(
    'pg_advisory_xact_lock(2026090609);'
    in lower(pg_get_functiondef(
      'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)'::regprocedure
    ))
  ) < position(
    'from public.leagues as league'
    in lower(pg_get_functiondef(
      'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)'::regprocedure
    ))
  )
  and position(
    'from public.leagues as league'
    in lower(pg_get_functiondef(
      'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)'::regprocedure
    ))
  ) < position(
    'private.slice9_lock_leagues'
    in lower(pg_get_functiondef(
      'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)'::regprocedure
    ))
  )
  and lower(pg_get_functiondef(
    'private.slice9_resolve_match_result_review_without_global_lock(uuid,integer,public.match_status,numeric,numeric)'::regprocedure
  )) !~ 'pg_advisory_xact_lock\([[:space:]]*2026090609[[:space:]]*\)',
  'review resolution orders registry barrier before discovery before affected league keys while its delegate stays barrier-free'
);

select ok(
  position(
    'private.slice9_lock_leagues'
    in lower(pg_get_functiondef(
      'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
    ))
  ) > 0
  and lower(pg_get_functiondef(
    'private.slice9_reconcile_completed_league_without_global_lock(uuid,integer,text)'::regprocedure
  )) !~ 'pg_advisory_xact_lock\([[:space:]]*2026090609[[:space:]]*\)',
  'reconciliation remains scoped only by its affected league key'
);

select isnt(
  pg_catalog.hashtext('da100000-0000-4000-8000-000000000301'),
  pg_catalog.hashtext('da100000-0000-4000-8000-000000000302'),
  'the two isolated fixture leagues use distinct advisory keys'
);

create function pg_temp.wait_for_lock(p_backend_pid integer)
returns boolean
language plpgsql
as $$
declare
  v_attempt integer := 0;
begin
  loop
    if exists (
      select 1
      from pg_catalog.pg_stat_activity as activity
      where activity.pid = p_backend_pid
        and activity.wait_event_type = 'Lock'
    ) then
      return true;
    end if;
    v_attempt := v_attempt + 1;
    if v_attempt >= 300 then return false; end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
end;
$$;

create function pg_temp.wait_until_ready(p_connection text)
returns boolean
language plpgsql
as $$
declare
  v_attempt integer := 0;
begin
  loop
    if extensions.dblink_is_busy(p_connection) = 0 then
      return true;
    end if;
    v_attempt := v_attempt + 1;
    if v_attempt >= 300 then return false; end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
end;
$$;

select is(
  extensions.dblink_connect(
    'league_scope_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ), 'OK', 'the fixture control connection opens'
);
select is(
  extensions.dblink_connect(
    'league_scope_holder',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ), 'OK', 'the league A holder connection opens'
);
select is(
  extensions.dblink_connect(
    'league_scope_same',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ), 'OK', 'the same-league waiter connection opens'
);
select is(
  extensions.dblink_connect(
    'league_scope_other',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ), 'OK', 'the unrelated-league caller connection opens'
);

select is(
  extensions.dblink_exec('league_scope_control', $remote$
    delete from public.predictions
    where league_id between
      'da100000-0000-4000-8000-000000000301'::uuid and
      'da100000-0000-4000-8000-000000000302'::uuid;
    delete from public.league_members
    where league_id between
      'da100000-0000-4000-8000-000000000301'::uuid and
      'da100000-0000-4000-8000-000000000302'::uuid;
    delete from public.league_scoring_rules
    where league_id between
      'da100000-0000-4000-8000-000000000301'::uuid and
      'da100000-0000-4000-8000-000000000302'::uuid;
    delete from public.leagues
    where id between
      'da100000-0000-4000-8000-000000000301'::uuid and
      'da100000-0000-4000-8000-000000000302'::uuid;
    delete from public.matches
    where id between
      'da100000-0000-4000-8000-000000000201'::uuid and
      'da100000-0000-4000-8000-000000000202'::uuid;
    delete from public.seasons
    where id between
      'da100000-0000-4000-8000-000000000101'::uuid and
      'da100000-0000-4000-8000-000000000102'::uuid;
    delete from auth.users
    where id = 'da100000-0000-4000-8000-000000000001'::uuid;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      'da100000-0000-4000-8000-000000000001',
      'authenticated', 'authenticated', 'league-scope@example.com',
      extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      '{"display_name":"League Scope"}', now(), now()
    );

    insert into public.seasons (
      id, competition_id, name, starts_on, ends_on, is_current
    ) values
      ('da100000-0000-4000-8000-000000000101', '26000000-0000-4000-8000-000000000001', 'Scoped lock A', '2026-01-01', '2026-12-31', false),
      ('da100000-0000-4000-8000-000000000102', '26000000-0000-4000-8000-000000000001', 'Scoped lock B', '2026-01-01', '2026-12-31', false);

    insert into public.matches (
      id, season_id, round_number, home_team_id, away_team_id,
      kickoff_at, status
    ) values
      ('da100000-0000-4000-8000-000000000201', 'da100000-0000-4000-8000-000000000101', 1, '26000000-0000-4000-8000-000000000101', '26000000-0000-4000-8000-000000000102', clock_timestamp() + interval '1 day', 'scheduled'),
      ('da100000-0000-4000-8000-000000000202', 'da100000-0000-4000-8000-000000000102', 1, '26000000-0000-4000-8000-000000000103', '26000000-0000-4000-8000-000000000104', clock_timestamp() + interval '1 day', 'scheduled');

    insert into public.leagues (
      id, manager_id, season_id, name, status
    ) values
      ('da100000-0000-4000-8000-000000000301', 'da100000-0000-4000-8000-000000000001', 'da100000-0000-4000-8000-000000000101', 'Scoped league A', 'open'),
      ('da100000-0000-4000-8000-000000000302', 'da100000-0000-4000-8000-000000000001', 'da100000-0000-4000-8000-000000000102', 'Scoped league B', 'open');

    insert into public.league_scoring_rules (league_id)
    values
      ('da100000-0000-4000-8000-000000000301'),
      ('da100000-0000-4000-8000-000000000302');

    insert into public.league_members (
      league_id, user_id, status, approved_by, approved_at
    ) values
      ('da100000-0000-4000-8000-000000000301', 'da100000-0000-4000-8000-000000000001', 'active', 'da100000-0000-4000-8000-000000000001', now()),
      ('da100000-0000-4000-8000-000000000302', 'da100000-0000-4000-8000-000000000001', 'active', 'da100000-0000-4000-8000-000000000001', now());
  $remote$),
  'INSERT 0 2',
  'the two-league committed fixture is created'
);

select is(
  extensions.dblink_exec('league_scope_same', $remote$
    set statement_timeout = '10s';
    create function pg_temp.try_save(p_league uuid, p_match uuid)
    returns text language plpgsql as $function$
    declare v_result record;
    begin
      perform set_config(
        'request.jwt.claims',
        jsonb_build_object(
          'sub', 'da100000-0000-4000-8000-000000000001',
          'role', 'authenticated'
        )::text,
        true
      );
      select * into strict v_result
      from public.save_prediction(p_league, p_match, 2, 1);
      return 'SAVED:' || v_result.league_id::text;
    exception when others then
      return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
  $remote$),
  'CREATE FUNCTION',
  'the same-league caller helper is installed'
);

select is(
  extensions.dblink_exec('league_scope_other', $remote$
    set statement_timeout = '10s';
    create function pg_temp.try_save(p_league uuid, p_match uuid)
    returns text language plpgsql as $function$
    declare v_result record;
    begin
      perform set_config(
        'request.jwt.claims',
        jsonb_build_object(
          'sub', 'da100000-0000-4000-8000-000000000001',
          'role', 'authenticated'
        )::text,
        true
      );
      select * into strict v_result
      from public.save_prediction(p_league, p_match, 3, 2);
      return 'SAVED:' || v_result.league_id::text;
    exception when others then
      return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
  $remote$),
  'CREATE FUNCTION',
  'the unrelated-league caller helper is installed'
);

select is(
  extensions.dblink_exec('league_scope_holder', $remote$
    begin;
    do $block$
    begin
      perform set_config(
        'request.jwt.claims',
        jsonb_build_object(
          'sub', 'da100000-0000-4000-8000-000000000001',
          'role', 'authenticated'
        )::text,
        true
      );
      perform public.save_prediction(
        'da100000-0000-4000-8000-000000000301',
        'da100000-0000-4000-8000-000000000201',
        1,
        0
      );
    end $block$;
  $remote$),
  'DO',
  'a successful save keeps league A transaction and advisory key open'
);

create temp table league_scope_pids as
select 'same'::text as caller, pid
from extensions.dblink(
  'league_scope_same', 'select pg_backend_pid()'
) as result(pid integer)
union all
select 'other', pid
from extensions.dblink(
  'league_scope_other', 'select pg_backend_pid()'
) as result(pid integer);

select is(
  extensions.dblink_send_query(
    'league_scope_same',
    $$select pg_temp.try_save(
      'da100000-0000-4000-8000-000000000301',
      'da100000-0000-4000-8000-000000000201'
    )$$
  ),
  1,
  'the same-league save starts while league A is held'
);
select ok(
  pg_temp.wait_for_lock(
    (select pid from league_scope_pids where caller = 'same')
  ),
  'the same-league save waits on league A serialization'
);

select is(
  extensions.dblink_send_query(
    'league_scope_other',
    $$select pg_temp.try_save(
      'da100000-0000-4000-8000-000000000302',
      'da100000-0000-4000-8000-000000000202'
    )$$
  ),
  1,
  'the unrelated-league save starts while league A remains held'
);
select ok(
  pg_temp.wait_until_ready('league_scope_other'),
  'the unrelated-league save completes before league A commits'
);
select results_eq(
  $$select value from extensions.dblink_get_result('league_scope_other')
    as result(value text)$$,
  $$values ('SAVED:da100000-0000-4000-8000-000000000302'::text)$$,
  'league B is not serialized behind league A'
);
select is(
  (
    select count(*)::integer
    from extensions.dblink_get_result('league_scope_other')
      as drained(value text)
  ),
  0,
  'the unrelated-league result is fully drained'
);

select is(
  extensions.dblink_exec('league_scope_holder', 'commit'),
  'COMMIT',
  'league A is released after league B has already committed'
);
select ok(
  pg_temp.wait_until_ready('league_scope_same'),
  'the same-league waiter finishes after league A commits'
);
select results_eq(
  $$select value from extensions.dblink_get_result('league_scope_same')
    as result(value text)$$,
  $$values ('SAVED:da100000-0000-4000-8000-000000000301'::text)$$,
  'the same-league waiter succeeds after serialization'
);
select is(
  (
    select count(*)::integer
    from extensions.dblink_get_result('league_scope_same')
      as drained(value text)
  ),
  0,
  'the same-league result is fully drained'
);

select is(
  (
    select count(*)::integer
    from public.predictions as prediction
    where prediction.league_id in (
      'da100000-0000-4000-8000-000000000301',
      'da100000-0000-4000-8000-000000000302'
    )
  ),
  2,
  'both league-scoped saves persist exactly one prediction'
);

select is(
  extensions.dblink_exec('league_scope_control', $remote$
    update public.leagues
    set status = 'completed', completed_at = clock_timestamp()
    where id in (
      'da100000-0000-4000-8000-000000000301'::uuid,
      'da100000-0000-4000-8000-000000000302'::uuid
    );
  $remote$),
  'UPDATE 2',
  'both fixtures enter the idempotent completed state'
);

select is(
  extensions.dblink_exec('league_scope_other', $remote$
    create function pg_temp.try_complete(p_league uuid)
    returns text language plpgsql as $function$
    declare v_result record;
    begin
      perform set_config(
        'request.jwt.claims',
        jsonb_build_object(
          'sub', 'da100000-0000-4000-8000-000000000001',
          'role', 'authenticated'
        )::text,
        true
      );
      select * into strict v_result
      from public.complete_league(p_league);
      return 'COMPLETED:' || v_result.result_league_id::text;
    exception when others then
      return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end $function$;
  $remote$),
  'CREATE FUNCTION',
  'the unrelated-league completion helper is installed'
);

select is(
  extensions.dblink_exec('league_scope_holder', $remote$
    begin;
    do $block$
    begin
      perform set_config(
        'request.jwt.claims',
        jsonb_build_object(
          'sub', 'da100000-0000-4000-8000-000000000001',
          'role', 'authenticated'
        )::text,
        true
      );
      perform public.complete_league(
        'da100000-0000-4000-8000-000000000301'
      );
    end $block$;
  $remote$),
  'DO',
  'an idempotent completion keeps league A transaction and key open'
);

select is(
  extensions.dblink_send_query(
    'league_scope_other',
    $$select pg_temp.try_complete(
      'da100000-0000-4000-8000-000000000302'
    )$$
  ),
  1,
  'the unrelated-league completion starts while league A remains held'
);
select ok(
  pg_temp.wait_until_ready('league_scope_other'),
  'the unrelated-league completion finishes before league A commits'
);
select results_eq(
  $$select value from extensions.dblink_get_result('league_scope_other')
    as result(value text)$$,
  $$values ('COMPLETED:da100000-0000-4000-8000-000000000302'::text)$$,
  'league B completion is not serialized behind league A completion'
);
select is(
  (
    select count(*)::integer
    from extensions.dblink_get_result('league_scope_other')
      as drained(value text)
  ),
  0,
  'the unrelated-league completion result is fully drained'
);
select is(
  extensions.dblink_exec('league_scope_holder', 'commit'),
  'COMMIT',
  'league A completion is released after league B already returned'
);

select is(extensions.dblink_disconnect('league_scope_holder'), 'OK',
  'the league A holder disconnects');
select is(extensions.dblink_disconnect('league_scope_same'), 'OK',
  'the same-league waiter disconnects');
select is(extensions.dblink_disconnect('league_scope_other'), 'OK',
  'the unrelated-league caller disconnects');

select is(
  extensions.dblink_exec('league_scope_control', $remote$
    delete from public.predictions
    where league_id between
      'da100000-0000-4000-8000-000000000301'::uuid and
      'da100000-0000-4000-8000-000000000302'::uuid;
    delete from public.league_members
    where league_id between
      'da100000-0000-4000-8000-000000000301'::uuid and
      'da100000-0000-4000-8000-000000000302'::uuid;
    delete from public.league_scoring_rules
    where league_id between
      'da100000-0000-4000-8000-000000000301'::uuid and
      'da100000-0000-4000-8000-000000000302'::uuid;
    delete from public.leagues
    where id between
      'da100000-0000-4000-8000-000000000301'::uuid and
      'da100000-0000-4000-8000-000000000302'::uuid;
    delete from public.matches
    where id between
      'da100000-0000-4000-8000-000000000201'::uuid and
      'da100000-0000-4000-8000-000000000202'::uuid;
    delete from public.seasons
    where id between
      'da100000-0000-4000-8000-000000000101'::uuid and
      'da100000-0000-4000-8000-000000000102'::uuid;
    delete from auth.users
    where id = 'da100000-0000-4000-8000-000000000001'::uuid;
  $remote$),
  'DELETE 1',
  'the committed league-scope fixture is removed'
);
select is(extensions.dblink_disconnect('league_scope_control'), 'OK',
  'the fixture control connection disconnects');

select * from finish();

rollback;
