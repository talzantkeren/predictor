-- The scoring writers authenticate before or after advisory waits, then retain
-- the same system-admin row through commit. Real dblink sessions prove that a
-- concurrent revocation cannot pass an already-authorized retained actor.

begin;

select no_plan();

create extension if not exists dblink with schema extensions;

select ok(
  to_regprocedure('private.slice9_retain_system_actor_from_request()') is not null
  and not (
    select routine.prosecdef
    from pg_proc as routine
    where routine.oid =
      'private.slice9_retain_system_actor_from_request()'::regprocedure
  )
  and (
    select routine.proconfig @> array['search_path=""']
    from pg_proc as routine
    where routine.oid =
      'private.slice9_retain_system_actor_from_request()'::regprocedure
  )
  and position(
    'for key share'
    in lower(pg_get_functiondef(
      'private.slice9_retain_system_actor_from_request()'::regprocedure
    ))
  ) > 0
  and not has_function_privilege(
    'anon', 'private.slice9_retain_system_actor_from_request()', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.slice9_retain_system_actor_from_request()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'private.slice9_retain_system_actor_from_request()',
    'EXECUTE'
  ),
  'the post-wait actor-retention helper is invoker-rights, empty-path, key-share retaining, and private'
);

select is(
  (
    select count(*)::integer
    from (
      values
        (
          'public.score_match(uuid,public.match_status,numeric,numeric,boolean,text)'::regprocedure,
          'private.slice9_score_match_without_registry_barrier'::text
        ),
        (
          'public.create_or_correct_match(text,uuid,uuid,uuid,uuid,numeric,timestamp with time zone,public.match_status,numeric,numeric)'::regprocedure,
          'private.slice9_create_or_correct_match_with_global_lock'::text
        ),
        (
          'public.resolve_match_result_review(uuid,integer,public.match_status,numeric,numeric)'::regprocedure,
          'private.slice9_resolve_match_result_review_without_global_lock'::text
        )
    ) as boundary(routine_oid, delegate_marker)
    cross join lateral (
      select lower(pg_get_functiondef(boundary.routine_oid)) as definition
    ) as source
    where position('pg_advisory_xact_lock(2026090609);' in source.definition) > 0
      and position('private.slice9_lock_leagues' in source.definition) >
        position('pg_advisory_xact_lock(2026090609);' in source.definition)
      and position(
        'private.slice9_retain_system_actor_from_request'
        in source.definition
      ) > position('private.slice9_lock_leagues' in source.definition)
      and position(boundary.delegate_marker in source.definition) > position(
        'private.slice9_retain_system_actor_from_request'
        in source.definition
      )
  ),
  3,
  'all three scoring writers order registry then league keys then actor retention then delegate'
);

create function pg_temp.wait_for_remote_lock(p_backend_pid integer)
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
    if v_attempt >= 300 then
      return false;
    end if;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
end;
$$;

select is(
  extensions.dblink_connect(
    'slice9_actor_retain_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the actor-retention control connection opens'
);
select is(
  extensions.dblink_connect(
    'slice9_actor_retain_holder',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the actor-retention holder connection opens'
);
select is(
  extensions.dblink_connect(
    'slice9_actor_retain_revoker',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the actor-retention revoker connection opens'
);

select is(
  extensions.dblink_exec('slice9_actor_retain_control', $remote$
    delete from public.system_admins
    where user_id = 'db100000-0000-4000-8000-000000000001'::uuid;
    delete from auth.users
    where id = 'db100000-0000-4000-8000-000000000001'::uuid;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      'db100000-0000-4000-8000-000000000001',
      'authenticated', 'authenticated',
      'slice9-actor-retention@example.com',
      extensions.crypt(
        extensions.gen_random_uuid()::text,
        extensions.gen_salt('bf')
      ),
      clock_timestamp(),
      '{"provider":"email","providers":["email"]}',
      '{"display_name":"Slice 9 Actor Retention"}',
      clock_timestamp(), clock_timestamp()
    );
    insert into public.system_admins (user_id, granted_by)
    values (
      'db100000-0000-4000-8000-000000000001',
      'db100000-0000-4000-8000-000000000001'
    );
  $remote$),
  'INSERT 0 1',
  'the committed disposable system actor is installed'
);
select is(
  extensions.dblink_exec('slice9_actor_retain_holder', $remote$
    set statement_timeout = '10s';
    set lock_timeout = '8s';
    begin;
    set request.headers =
      '{"x-predictor-system-actor":"db100000-0000-4000-8000-000000000001"}';
  $remote$),
  'SET',
  'the holder transaction has a bounded fixed actor context'
);
select results_eq(
  $$select actor_id
    from extensions.dblink(
      'slice9_actor_retain_holder',
      'select private.slice9_retain_system_actor_from_request()'
    ) as result(actor_id uuid)$$,
  $$values ('db100000-0000-4000-8000-000000000001'::uuid)$$,
  'the helper returns and retains the verified actor inside the open transaction'
);
select is(
  extensions.dblink_exec('slice9_actor_retain_revoker', $remote$
    set statement_timeout = '10s';
    set lock_timeout = '8s';
    create function pg_temp.revoke_retained_actor()
    returns integer
    language plpgsql
    as $function$
    declare
      v_rows integer;
    begin
      delete from public.system_admins
      where user_id = 'db100000-0000-4000-8000-000000000001';
      get diagnostics v_rows = row_count;
      return v_rows;
    end;
    $function$;
  $remote$),
  'CREATE FUNCTION',
  'the revoker has a bounded row-count probe'
);

create temp table slice9_actor_retain_pids as
select pid
from extensions.dblink(
  'slice9_actor_retain_revoker',
  'select pg_catalog.pg_backend_pid()'
) as result(pid integer);

select is(
  extensions.dblink_send_query(
    'slice9_actor_retain_revoker',
    'select pg_temp.revoke_retained_actor()'
  ),
  1,
  'administrator revocation starts behind the retained actor'
);
select ok(
  pg_temp.wait_for_remote_lock((select pid from slice9_actor_retain_pids)),
  'revocation waits while the authorized transaction retains FOR KEY SHARE'
);
select is(
  extensions.dblink_exec('slice9_actor_retain_holder', 'commit'),
  'COMMIT',
  'the authorized holder commits before revocation can proceed'
);
select results_eq(
  $$select rows_deleted
    from extensions.dblink_get_result('slice9_actor_retain_revoker', false)
      as result(rows_deleted integer)$$,
  $$values (1)$$,
  'revocation deletes the actor only after the retaining transaction commits'
);
select is(
  (
    select count(*)::integer
    from extensions.dblink_get_result('slice9_actor_retain_revoker', false)
      as drained(value text)
  ),
  0,
  'the actor-revocation result is fully drained'
);
select is(
  extensions.dblink_exec('slice9_actor_retain_control', $remote$
    delete from public.system_admins
    where user_id = 'db100000-0000-4000-8000-000000000001'::uuid;
    delete from auth.users
    where id = 'db100000-0000-4000-8000-000000000001'::uuid;
  $remote$),
  'DELETE 1',
  'the disposable actor fixture is removed'
);

select is(
  extensions.dblink_disconnect('slice9_actor_retain_holder'),
  'OK',
  'the actor-retention holder disconnects'
);
select is(
  extensions.dblink_disconnect('slice9_actor_retain_revoker'),
  'OK',
  'the actor-retention revoker disconnects'
);
select is(
  extensions.dblink_disconnect('slice9_actor_retain_control'),
  'OK',
  'the actor-retention control disconnects'
);

select * from finish();

rollback;
