-- A manager decision can remove the exact cursor row from a filtered queue
-- between page reads. These committed dblink sessions prove that the immutable
-- (created_at, id) cursor still reaches every older request without a gap or
-- duplicate. A single pgTAP transaction cannot establish this behavior.
begin;

select no_plan();

create extension if not exists dblink with schema extensions;

create function pg_temp.wait_for_remote_completion(p_connection_name text)
returns boolean
language plpgsql
as $$
declare
  v_attempt integer := 0;
begin
  loop
    if extensions.dblink_is_busy(p_connection_name) = 0 then
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
    'pagination_control',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the committed pagination-fixture connection opens'
);
select is(
  extensions.dblink_connect(
    'pagination_reader',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the authenticated queue-reader connection opens'
);
select is(
  extensions.dblink_connect(
    'pagination_decider',
    'host=supabase_db_predictor port=5432 dbname=postgres user=postgres password=postgres'
  ),
  'OK',
  'the independent manager-decision connection opens'
);

select is(
  extensions.dblink_exec('pagination_control', $remote$
    delete from public.audit_logs
    where entity_id between
      'd9a20000-0000-4000-8000-000000000001'
      and 'd9a20000-0000-4000-8000-000000000021';
    delete from public.join_requests
    where league_id = 'd9a30000-0000-4000-8000-000000000001';
    delete from public.league_members
    where league_id = 'd9a30000-0000-4000-8000-000000000001';
    delete from public.leagues
    where id = 'd9a30000-0000-4000-8000-000000000001';
    delete from auth.users
    where id = 'd9a00000-0000-4000-8000-000000000001'
       or id between
         'd9a10000-0000-4000-8000-000000000001'
         and 'd9a10000-0000-4000-8000-000000000021';

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      'd9a00000-0000-4000-8000-000000000001',
      'authenticated', 'authenticated',
      'pagination-race-manager@example.com',
      extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      '{"display_name":"Pagination Race Manager"}', now(), now()
    );

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    select
      '00000000-0000-0000-0000-000000000000',
      ('d9a10000-0000-4000-8000-' || lpad(series.i::text, 12, '0'))::uuid,
      'authenticated', 'authenticated',
      'pagination-race-requester-' || series.i::text || '@example.com',
      extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      pg_catalog.jsonb_build_object(
        'display_name', 'Pagination requester ' || series.i::text
      ),
      now(), now()
    from pg_catalog.generate_series(1, 21) as series(i);

    insert into public.leagues (
      id, manager_id, season_id, name, status, created_at, updated_at
    ) values (
      'd9a30000-0000-4000-8000-000000000001',
      'd9a00000-0000-4000-8000-000000000001',
      '26000000-0000-4000-8000-000000000027',
      'Pagination concurrency league', 'open', now(), now()
    );

    insert into public.join_requests (
      id, league_id, user_id, status, created_at, updated_at
    )
    select
      ('d9a20000-0000-4000-8000-' || lpad(series.i::text, 12, '0'))::uuid,
      'd9a30000-0000-4000-8000-000000000001',
      ('d9a10000-0000-4000-8000-' || lpad(series.i::text, 12, '0'))::uuid,
      'pending_approval',
      '2026-08-27 12:00:00+00'::timestamptz,
      '2026-08-27 12:00:00+00'::timestamptz
    from pg_catalog.generate_series(1, 21) as series(i);
  $remote$),
  'INSERT 0 21',
  'the equal-timestamp queue fixture is committed'
);

select is(
  extensions.dblink_exec('pagination_reader', $remote$
    set statement_timeout = '10s';
    set lock_timeout = '5s';
    set role authenticated;
    set request.jwt.claims =
      '{"sub":"d9a00000-0000-4000-8000-000000000001","role":"authenticated"}';
  $remote$),
  'SET',
  'the reader derives the exact manager actor from its session'
);
select is(
  extensions.dblink_exec('pagination_decider', $remote$
    set statement_timeout = '10s';
    set lock_timeout = '5s';
    set role authenticated;
    set request.jwt.claims =
      '{"sub":"d9a00000-0000-4000-8000-000000000001","role":"authenticated"}';
  $remote$),
  'SET',
  'the decision session derives the same exact manager independently'
);

create temp table pagination_first_page as
select result.request_id, result.created_at
from extensions.dblink(
  'pagination_reader',
  $remote$
    select page.request_id, page.created_at
    from public.get_manager_join_requests_page(
      'd9a30000-0000-4000-8000-000000000001',
      'pending_approval', null, null, 10
    ) as page
    order by page.created_at desc, page.request_id desc
    limit 10
  $remote$
) as result(request_id uuid, created_at timestamptz);

select is(
  (select pg_catalog.count(*)::integer from pagination_first_page),
  10,
  'the first filtered page contains ten visible requests'
);
select is(
  (
    select request_id::text
    from pagination_first_page
    order by created_at asc, request_id asc
    limit 1
  ),
  'd9a20000-0000-4000-8000-000000000012',
  'the equal-timestamp UUID tie-breaker produces the expected cursor row'
);

select is(
  extensions.dblink_send_query('pagination_decider', $remote$
    select request_id::text, request_status::text
    from public.reject_join_request(
      'd9a20000-0000-4000-8000-000000000012',
      'Concurrent pagination decision'
    )
  $remote$),
  1,
  'the independent manager decision starts asynchronously on the cursor row'
);
select ok(
  pg_temp.wait_for_remote_completion('pagination_decider'),
  'the asynchronous manager decision finishes within the bounded wait'
);

create temp table pagination_decision_result as
select result.request_id, result.request_status
from extensions.dblink_get_result('pagination_decider')
  as result(request_id text, request_status text);
select is(
  (select request_status from pagination_decision_result),
  'rejected',
  'the cursor request commits its terminal decision between page reads'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from extensions.dblink_get_result('pagination_decider')
      as drained(value text)
  ),
  0,
  'the asynchronous decision result is fully drained'
);

create temp table pagination_second_page as
select result.request_id, result.created_at
from extensions.dblink(
  'pagination_reader',
  $remote$
    select page.request_id, page.created_at
    from public.get_manager_join_requests_page(
      'd9a30000-0000-4000-8000-000000000001',
      'pending_approval',
      '2026-08-27 12:00:00+00',
      'd9a20000-0000-4000-8000-000000000012',
      10
    ) as page
    order by page.created_at desc, page.request_id desc
    limit 10
  $remote$
) as result(request_id uuid, created_at timestamptz);

select is(
  (select pg_catalog.count(*)::integer from pagination_second_page),
  10,
  'the second page remains full after the cursor row leaves the filter'
);
select results_eq(
  $$select request_id::text
    from pagination_second_page
    order by created_at desc, request_id desc$$,
  $$select ('d9a20000-0000-4000-8000-' || lpad(series.i::text, 12, '0'))
    from pg_catalog.generate_series(11, 2, -1) as series(i)$$,
  'the second page has the exact next ten UUIDs without a gap or duplicate'
);

create temp table pagination_last_page as
select result.request_id, result.created_at
from extensions.dblink(
  'pagination_reader',
  $remote$
    select page.request_id, page.created_at
    from public.get_manager_join_requests_page(
      'd9a30000-0000-4000-8000-000000000001',
      'pending_approval',
      '2026-08-27 12:00:00+00',
      'd9a20000-0000-4000-8000-000000000002',
      10
    ) as page
    order by page.created_at desc, page.request_id desc
    limit 10
  $remote$
) as result(request_id uuid, created_at timestamptz);

select results_eq(
  $$select request_id::text from pagination_last_page$$,
  $$values ('d9a20000-0000-4000-8000-000000000001'::text)$$,
  'the final page remains reachable from the stale traversal'
);
select is(
  (
    select pg_catalog.count(distinct request_id)::integer
    from (
      select request_id from pagination_first_page
      union all
      select request_id from pagination_second_page
      union all
      select request_id from pagination_last_page
    ) as visited
  ),
  21,
  'the complete stale traversal visits all original requests exactly once'
);
select is(
  (
    select pg_catalog.count(*)::integer
    from public.join_requests as request
    where request.league_id = 'd9a30000-0000-4000-8000-000000000001'
      and request.status = 'pending_approval'
  ),
  20,
  'only the independently decided request leaves the pending filter'
);

select is(
  extensions.dblink_exec('pagination_control', $remote$
    delete from public.audit_logs
    where entity_id between
      'd9a20000-0000-4000-8000-000000000001'
      and 'd9a20000-0000-4000-8000-000000000021';
    delete from public.join_requests
    where league_id = 'd9a30000-0000-4000-8000-000000000001';
    delete from public.league_members
    where league_id = 'd9a30000-0000-4000-8000-000000000001';
    delete from public.leagues
    where id = 'd9a30000-0000-4000-8000-000000000001';
    delete from auth.users
    where id = 'd9a00000-0000-4000-8000-000000000001'
       or id between
         'd9a10000-0000-4000-8000-000000000001'
         and 'd9a10000-0000-4000-8000-000000000021';
  $remote$),
  'DELETE 22',
  'all committed pagination-concurrency fixtures are removed'
);

select is(
  extensions.dblink_disconnect('pagination_control'),
  'OK',
  'the control connection closes'
);
select is(
  extensions.dblink_disconnect('pagination_reader'),
  'OK',
  'the queue-reader connection closes'
);
select is(
  extensions.dblink_disconnect('pagination_decider'),
  'OK',
  'the decision connection closes'
);

select * from finish();
rollback;
