-- The reconciliation bridge must fail before delegation when no work item
-- exists and must not follow a remapped work item after waiting on its first
-- discovered league key.
begin;

select no_plan();

create extension if not exists dblink with schema extensions;

select ok(
  (
    select prosecdef and proconfig @> array['search_path=""']
    from pg_proc
    where oid = 'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
  )
  and has_function_privilege(
    'service_role',
    'public.reconcile_completed_league(uuid,integer,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.reconcile_completed_league(uuid,integer,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reconcile_completed_league(uuid,integer,text)',
    'EXECUTE'
  ),
  'reconciliation keeps its hardened service-only boundary'
);

select ok(
  position(
    'private.slice9_lock_leagues'
    in lower(pg_get_functiondef(
      'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
    ))
  ) < position(
    'for update of league'
    in lower(pg_get_functiondef(
      'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
    ))
  )
  and position(
    'for update of league'
    in lower(pg_get_functiondef(
      'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
    ))
  ) < position(
    'from public.matches as match'
    in lower(pg_get_functiondef(
      'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
    ))
  )
  and position(
    'from public.matches as match'
    in lower(pg_get_functiondef(
      'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
    ))
  ) < position(
    'from public.league_match_snapshots as snapshot'
    in lower(pg_get_functiondef(
      'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
    ))
  )
  and position(
    'from public.league_match_snapshots as snapshot'
    in lower(pg_get_functiondef(
      'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
    ))
  ) < position(
    'and reconciliation.match_id = v_match_id'
    in lower(pg_get_functiondef(
      'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
    ))
  )
  and position(
    'and reconciliation.match_id = v_match_id'
    in lower(pg_get_functiondef(
      'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
    ))
  ) < position(
    'private.slice9_reconcile_completed_league_without_global_lock'
    in lower(pg_get_functiondef(
      'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
    ))
  )
  and lower(pg_get_functiondef(
    'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
  )) ~ 'from public.matches as match[[:space:]]+where match.id = v_match_id[[:space:]]+for update;'
  and lower(pg_get_functiondef(
    'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
  )) ~ 'from public.league_match_snapshots as snapshot[[:space:]]+where snapshot.league_id = v_league_id[[:space:]]+and snapshot.match_id = v_match_id[[:space:]]+for update;'
  and lower(pg_get_functiondef(
    'public.reconcile_completed_league(uuid,integer,text)'::regprocedure
  )) ~ 'and reconciliation.league_id = v_league_id[[:space:]]+and reconciliation.match_id = v_match_id[[:space:]]+for update;',
  'the wrapper re-verifies and locks league, match, snapshot, and work item before delegation'
);

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select throws_ok(
  $$select * from public.reconcile_completed_league(
    'd9920000-0000-4000-8000-000000000499', 1, null
  )$$,
  'P0001', 'VALIDATION_ERROR',
  'a null reconciliation decision fails validation before discovery'
);
reset role;

alter function private.slice9_reconcile_completed_league_without_global_lock(
  uuid, integer, text
) rename to slice9_reconciliation_delegate_unavailable;

set local role service_role;
select set_config(
  'request.headers',
  '{"x-predictor-system-actor":"70000000-0000-4000-8000-000000000007"}',
  true
);
select throws_ok(
  $$select * from public.reconcile_completed_league(
    'd9920000-0000-4000-8000-000000000499', 1, 'dismiss'
  )$$,
  'P0001', 'RECONCILIATION_NOT_FOUND',
  'a missing work item fails closed before the private delegate is resolved'
);
reset role;

alter function private.slice9_reconciliation_delegate_unavailable(
  uuid, integer, text
) rename to slice9_reconcile_completed_league_without_global_lock;

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

select is(
  extensions.dblink_connect(
    'reconciliation_reverify_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the reconciliation control connection opens'
);
select is(
  extensions.dblink_connect(
    'reconciliation_reverify_locker',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the original-league locker connection opens'
);
select is(
  extensions.dblink_connect(
    'reconciliation_reverify_caller',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the reconciliation caller connection opens'
);
select is(
  extensions.dblink_connect(
    'reconciliation_reverify_remapper',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the work-item remapper connection opens'
);

select is(
  extensions.dblink_exec('reconciliation_reverify_control', $remote$
    delete from public.audit_logs
    where entity_id between
      'd9920000-0000-4000-8000-000000000200'::uuid and
      'd9920000-0000-4000-8000-000000000499'::uuid;
    delete from public.league_match_reconciliations
    where id = 'd9920000-0000-4000-8000-000000000401';
    delete from public.league_match_snapshots
    where league_id in (
      'd9920000-0000-4000-8000-000000000301',
      'd9920000-0000-4000-8000-000000000302'
    );
    delete from public.league_scoring_rules
    where league_id in (
      'd9920000-0000-4000-8000-000000000301',
      'd9920000-0000-4000-8000-000000000302'
    );
    delete from public.leagues
    where id in (
      'd9920000-0000-4000-8000-000000000301',
      'd9920000-0000-4000-8000-000000000302'
    );
    delete from public.matches
    where id = 'd9920000-0000-4000-8000-000000000201';
    delete from public.seasons
    where id = 'd9920000-0000-4000-8000-000000000101';
    delete from public.teams
    where id in (
      'd9920000-0000-4000-8000-000000000111',
      'd9920000-0000-4000-8000-000000000112'
    );
    delete from public.competitions
    where id = 'd9920000-0000-4000-8000-000000000100';
    delete from public.system_admins
    where user_id = 'd9920000-0000-4000-8000-000000000001';
    delete from auth.users
    where id = 'd9920000-0000-4000-8000-000000000001';

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      'd9920000-0000-4000-8000-000000000001',
      'authenticated', 'authenticated',
      'reconciliation-reverify-admin@example.com',
      extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      '{"display_name":"Reconciliation Reverify Admin"}', now(), now()
    );
    insert into public.system_admins (user_id, granted_by)
    values (
      'd9920000-0000-4000-8000-000000000001',
      'd9920000-0000-4000-8000-000000000001'
    );

    insert into public.competitions (id, name, slug, country_code)
    values (
      'd9920000-0000-4000-8000-000000000100',
      'Reconciliation reverify competition',
      'reconciliation-reverify-competition', 'IL'
    );
    insert into public.seasons (
      id, competition_id, name, starts_on, ends_on, is_current
    ) values (
      'd9920000-0000-4000-8000-000000000101',
      'd9920000-0000-4000-8000-000000000100',
      'Reconciliation reverify season', '2026-01-01', '2026-12-31', false
    );
    insert into public.teams (id, name, short_name) values
      (
        'd9920000-0000-4000-8000-000000000111',
        'Reconciliation reverify home', 'Reverify home'
      ),
      (
        'd9920000-0000-4000-8000-000000000112',
        'Reconciliation reverify away', 'Reverify away'
      );
    insert into public.matches (
      id, season_id, round_number, home_team_id, away_team_id,
      kickoff_at, status, provider_status, home_score, away_score,
      predictions_locked_at, result_version
    ) values (
      'd9920000-0000-4000-8000-000000000201',
      'd9920000-0000-4000-8000-000000000101', 1,
      'd9920000-0000-4000-8000-000000000111',
      'd9920000-0000-4000-8000-000000000112',
      clock_timestamp() - interval '2 hours', 'finished', 'FT', 2, 1,
      clock_timestamp() - interval '2 hours', 2
    );
    insert into public.leagues (
      id, manager_id, season_id, name, status, activated_at, completed_at
    ) values
      (
        'd9920000-0000-4000-8000-000000000301',
        'd9920000-0000-4000-8000-000000000001',
        'd9920000-0000-4000-8000-000000000101',
        'Original reconciliation league', 'completed',
        clock_timestamp() - interval '2 days',
        clock_timestamp() - interval '1 day'
      ),
      (
        'd9920000-0000-4000-8000-000000000302',
        'd9920000-0000-4000-8000-000000000001',
        'd9920000-0000-4000-8000-000000000101',
        'Remapped reconciliation league', 'completed',
        clock_timestamp() - interval '2 days',
        clock_timestamp() - interval '1 day'
      );
    insert into public.league_scoring_rules (league_id, locked_at) values
      (
        'd9920000-0000-4000-8000-000000000301',
        clock_timestamp() - interval '2 days'
      ),
      (
        'd9920000-0000-4000-8000-000000000302',
        clock_timestamp() - interval '2 days'
      );
    insert into public.league_match_snapshots (
      league_id, match_id, completed_status, completed_home_score,
      completed_away_score, completed_result_version, completed_at
    ) values
      (
        'd9920000-0000-4000-8000-000000000301',
        'd9920000-0000-4000-8000-000000000201',
        'finished', 1, 1, 1, clock_timestamp() - interval '1 day'
      ),
      (
        'd9920000-0000-4000-8000-000000000302',
        'd9920000-0000-4000-8000-000000000201',
        'finished', 1, 1, 1, clock_timestamp() - interval '1 day'
      );
    insert into public.league_match_reconciliations (
      id, league_id, match_id, result_version, candidate_status,
      candidate_home_score, candidate_away_score, created_by
    ) values (
      'd9920000-0000-4000-8000-000000000401',
      'd9920000-0000-4000-8000-000000000301',
      'd9920000-0000-4000-8000-000000000201',
      2, 'finished', 2, 1,
      'd9920000-0000-4000-8000-000000000001'
    );
  $remote$),
  'INSERT 0 1',
  'the reconciliation remap fixture is committed and isolated'
);

select isnt(
  pg_catalog.hashtext('d9920000-0000-4000-8000-000000000301'),
  pg_catalog.hashtext('d9920000-0000-4000-8000-000000000302'),
  'the original and remapped leagues use distinct advisory keys'
);

select is(
  extensions.dblink_exec('reconciliation_reverify_locker', $remote$
    begin;
    do $block$
    begin
      perform pg_catalog.pg_advisory_xact_lock(
        2026090609,
        pg_catalog.hashtext('d9920000-0000-4000-8000-000000000301')
      );
    end
    $block$;
  $remote$),
  'DO',
  'the originally discovered league key is held'
);

select is(
  extensions.dblink_exec('reconciliation_reverify_caller', $remote$
    set statement_timeout = '15s';
    set lock_timeout = '10s';
    set role service_role;
    set request.headers =
      '{"x-predictor-system-actor":"d9920000-0000-4000-8000-000000000001"}';
    create function pg_temp.run_reconciliation_reverify()
    returns text
    language plpgsql
    as $function$
    declare v_result record;
    begin
      select * into v_result
      from public.reconcile_completed_league(
        'd9920000-0000-4000-8000-000000000401', 2, 'dismiss'
      );
      return 'DISMISSED:' || v_result.result_league_id::text;
    exception when others then
      return 'ERROR:' || sqlstate || ':' || sqlerrm;
    end
    $function$;
  $remote$),
  'CREATE FUNCTION',
  'the caller session has one fixed reconciliation operation'
);

create temp table reconciliation_reverify_pid as
select pid
from extensions.dblink(
  'reconciliation_reverify_caller', 'select pg_backend_pid()'
) as result(pid integer);

select is(
  extensions.dblink_send_query(
    'reconciliation_reverify_caller',
    'select pg_temp.run_reconciliation_reverify()'
  ),
  1,
  'reconciliation starts while its initially discovered league key is held'
);
select ok(
  pg_temp.wait_for_advisory_lock(
    (select pid from reconciliation_reverify_pid),
    2026090609::oid,
    pg_catalog.hashtext('d9920000-0000-4000-8000-000000000301')::oid,
    2::smallint,
    false
  ),
  'the reconciliation waits on the originally discovered league key'
);

select is(
  extensions.dblink_exec('reconciliation_reverify_remapper', $remote$
    update public.league_match_reconciliations as reconciliation
    set league_id = 'd9920000-0000-4000-8000-000000000302'
    where reconciliation.id = 'd9920000-0000-4000-8000-000000000401';
  $remote$),
  'UPDATE 1',
  'the work item is remapped while the wrapper waits on its first league key'
);

select is(
  extensions.dblink_exec('reconciliation_reverify_locker', 'commit'),
  'COMMIT',
  'the originally discovered league key is released after the remap commits'
);

select results_eq(
  $$select value
    from extensions.dblink_get_result(
      'reconciliation_reverify_caller'
    ) as result(value text)$$,
  $$values ('ERROR:P0001:RECONCILIATION_NOT_FOUND'::text)$$,
  'the post-lock re-read fails closed instead of following the remapped league'
);

select results_eq(
  $$select league_id, disposition::text, decided_by, decided_at
    from public.league_match_reconciliations
    where id = 'd9920000-0000-4000-8000-000000000401'$$,
  $$values (
    'd9920000-0000-4000-8000-000000000302'::uuid,
    'pending'::text, null::uuid, null::timestamptz
  )$$,
  'the remapped work item remains pending and unmodified'
);

select is(
  extensions.dblink_disconnect('reconciliation_reverify_remapper'),
  'OK',
  'the remapper connection disconnects'
);
select is(
  extensions.dblink_disconnect('reconciliation_reverify_caller'),
  'OK',
  'the caller connection disconnects'
);
select is(
  extensions.dblink_disconnect('reconciliation_reverify_locker'),
  'OK',
  'the locker connection disconnects'
);

select is(
  extensions.dblink_exec('reconciliation_reverify_control', $remote$
    delete from public.audit_logs
    where entity_id between
      'd9920000-0000-4000-8000-000000000200'::uuid and
      'd9920000-0000-4000-8000-000000000499'::uuid;
    delete from public.league_match_reconciliations
    where id = 'd9920000-0000-4000-8000-000000000401';
    delete from public.league_match_snapshots
    where league_id in (
      'd9920000-0000-4000-8000-000000000301',
      'd9920000-0000-4000-8000-000000000302'
    );
    delete from public.league_scoring_rules
    where league_id in (
      'd9920000-0000-4000-8000-000000000301',
      'd9920000-0000-4000-8000-000000000302'
    );
    delete from public.leagues
    where id in (
      'd9920000-0000-4000-8000-000000000301',
      'd9920000-0000-4000-8000-000000000302'
    );
    delete from public.matches
    where id = 'd9920000-0000-4000-8000-000000000201';
    delete from public.seasons
    where id = 'd9920000-0000-4000-8000-000000000101';
    delete from public.teams
    where id in (
      'd9920000-0000-4000-8000-000000000111',
      'd9920000-0000-4000-8000-000000000112'
    );
    delete from public.competitions
    where id = 'd9920000-0000-4000-8000-000000000100';
    delete from public.system_admins
    where user_id = 'd9920000-0000-4000-8000-000000000001';
    delete from auth.users
    where id = 'd9920000-0000-4000-8000-000000000001';
  $remote$),
  'DELETE 1',
  'the reconciliation remap fixture is removed'
);
select is(
  extensions.dblink_disconnect('reconciliation_reverify_control'),
  'OK',
  'the reconciliation control connection disconnects'
);

select * from finish();
rollback;
