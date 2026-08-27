-- Slice 9 editable league settings. Authenticated managers and system
-- administrators use narrow RPCs; browser table grants remain read-only and
-- the existing private-league RLS policies are not broadened for admins.

alter table public.leagues
  add column settings_version integer not null default 1,
  add constraint leagues_settings_version_check check (settings_version > 0);

alter table public.leagues
  add constraint leagues_joins_close_at_finite_check
  check (
    joins_close_at is null
    or pg_catalog.isfinite(joins_close_at)
  ) not valid;

-- Validate the historical rows explicitly so the migration fails closed
-- instead of leaving a legacy non-finite deadline outside the invariant.
alter table public.leagues
  validate constraint leagues_joins_close_at_finite_check;

comment on column public.leagues.settings_version is
  'Monotonic optimistic-concurrency version for the complete editable settings document.';

-- Existing updated_at triggers used transaction-start time. Settings and the
-- other row-serialized mutations need the wall clock at the actual write.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function private.touch_updated_at()
  from public, anon, authenticated, service_role;

-- Defense in depth for a privileged scoring write. Product writes use the
-- update_league_settings RPC below, which also serializes the season predicate.
create or replace function private.enforce_scoring_rule_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_first_kickoff timestamptz;
  v_league_status public.league_status;
  v_started_or_latched boolean;
  v_scoring_changed boolean;
  v_decision_at timestamptz;
begin
  v_scoring_changed :=
    new.exact_points is distinct from old.exact_points
    or new.correct_outcome_points is distinct from old.correct_outcome_points
    or new.incorrect_points is distinct from old.incorrect_points;

  if old.locked_at is not null and new.locked_at is distinct from old.locked_at then
    raise exception using errcode = 'P0001', message = 'SCORING_RULES_LOCKED';
  end if;

  if v_scoring_changed then
    select league.status,
           min(match.kickoff_at),
           coalesce(
             bool_or(
               match.predictions_locked_at is not null
               or match.status in ('live', 'finished')
             ),
             false
           )
      into v_league_status, v_first_kickoff, v_started_or_latched
      from public.leagues as league
      left join public.matches as match on match.season_id = league.season_id
      where league.id = old.league_id
      group by league.status;

    v_decision_at := clock_timestamp();

    if old.locked_at is not null
       or v_league_status not in ('draft', 'open')
       or v_started_or_latched
       or (v_first_kickoff is not null and v_decision_at >= v_first_kickoff) then
      raise exception using errcode = 'P0001', message = 'SCORING_RULES_LOCKED';
    end if;

    new.version := old.version + 1;
  elsif new.version is distinct from old.version then
    raise exception using errcode = 'P0001', message = 'SCORING_RULE_VERSION_INVALID';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_scoring_rule_lock()
  from public, anon, authenticated, service_role;

-- This gateway exposes one explicitly requested settings document to a system
-- administrator without an all-leagues SELECT policy that would pollute the
-- dashboard or make unrelated private leagues enumerable through tables.
create function public.get_editable_league_settings(p_league_id uuid)
returns table (
  league_id uuid,
  editor_role text,
  name text,
  description text,
  status public.league_status,
  settings_version integer,
  demo_entry_fee_agorot integer,
  demo_payment_instructions text,
  joins_close_at timestamptz,
  allow_late_join boolean,
  database_time timestamptz,
  first_kickoff_at timestamptz,
  has_started_or_latched boolean,
  rules_locked boolean,
  exact_points smallint,
  correct_outcome_points smallint,
  incorrect_points smallint,
  scoring_version integer,
  scoring_locked_at timestamptz,
  prizes jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_document record;
  v_league public.leagues%rowtype;
  v_scoring public.league_scoring_rules%rowtype;
  v_database_time timestamptz;
  v_first_kickoff timestamptz;
  v_started_or_latched boolean;
  v_prizes jsonb;
  v_prize_count integer;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  -- One SPI statement produces the entire document from one READ COMMITTED
  -- snapshot. Separate SELECT statements in a VOLATILE PL/pgSQL function could
  -- otherwise mix a league version with older scoring/prize rows.
  select league as league_row,
         scoring as scoring_row,
         match_facts.first_kickoff_at,
         match_facts.started_or_latched,
         prize_facts.prize_count,
         prize_facts.prizes,
         clock_timestamp() as database_time
    into v_document
    from public.leagues as league
    left join public.league_scoring_rules as scoring
      on scoring.league_id = league.id
    cross join lateral (
      select min(match.kickoff_at) as first_kickoff_at,
             coalesce(
               bool_or(
                 match.predictions_locked_at is not null
                 or match.status in ('live', 'finished')
               ),
               false
             ) as started_or_latched
      from public.matches as match
      where match.season_id = league.season_id
    ) as match_facts
    cross join lateral (
      select count(*)::integer as prize_count,
             coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'position', prize.position,
                   'percentage_bps', prize.percentage_bps
                 )
                 order by prize.position
               ),
               '[]'::jsonb
             ) as prizes
      from public.prize_rules as prize
      where prize.league_id = league.id
    ) as prize_facts
    where league.id = p_league_id
      and (
        league.manager_id = v_actor_id
        or exists (
          select 1
          from public.system_admins as administrator
          where administrator.user_id = v_actor_id
        )
      );

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAGUE_SETTINGS_NOT_FOUND';
  end if;

  v_league := v_document.league_row;
  v_scoring := v_document.scoring_row;
  v_first_kickoff := v_document.first_kickoff_at;
  v_started_or_latched := v_document.started_or_latched;
  v_prize_count := v_document.prize_count;
  v_prizes := v_document.prizes;
  v_database_time := v_document.database_time;

  if v_scoring.league_id is null
     or v_prize_count not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'LEAGUE_SETTINGS_UNAVAILABLE';
  end if;

  return query select
    v_league.id,
    case
      when v_league.manager_id = v_actor_id then 'manager'::text
      else 'system-admin'::text
    end,
    v_league.name,
    v_league.description,
    v_league.status,
    v_league.settings_version,
    v_league.demo_entry_fee_agorot,
    v_league.demo_payment_instructions,
    v_league.joins_close_at,
    v_league.allow_late_join,
    v_database_time,
    v_first_kickoff,
    v_started_or_latched,
    (
      v_scoring.locked_at is not null
      or v_league.status not in ('draft', 'open')
      or v_started_or_latched
      or (
        v_first_kickoff is not null
        and v_database_time >= v_first_kickoff
      )
    ),
    v_scoring.exact_points,
    v_scoring.correct_outcome_points,
    v_scoring.incorrect_points,
    v_scoring.version,
    v_scoring.locked_at,
    v_prizes;
end;
$$;

revoke all on function public.get_editable_league_settings(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_editable_league_settings(uuid)
  to authenticated;

comment on function public.get_editable_league_settings(uuid) is
  'Returns one authorized editable settings document without broadening private-league table RLS.';

create function public.update_league_settings(
  p_league_id uuid,
  p_expected_settings_version integer,
  p_name text,
  p_description text,
  p_demo_entry_fee_agorot integer,
  p_demo_payment_instructions text,
  p_joins_close_at timestamptz,
  p_allow_late_join boolean,
  p_exact_points smallint,
  p_correct_outcome_points smallint,
  p_incorrect_points smallint,
  p_prizes jsonb
)
returns table (
  league_id uuid,
  settings_version integer,
  scoring_version integer,
  changed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_preflight_manager_id uuid;
  v_league public.leagues%rowtype;
  v_scoring public.league_scoring_rules%rowtype;
  v_normalized_name text;
  v_normalized_description text;
  v_normalized_instructions text;
  v_trim_characters constant text := U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  v_prize_count integer;
  v_prize_total integer;
  v_distinct_positions integer;
  v_minimum_position integer;
  v_maximum_position integer;
  v_current_prizes jsonb;
  v_requested_prizes jsonb;
  v_details_changed boolean;
  v_scoring_changed boolean;
  v_prizes_changed boolean;
  v_any_changed boolean;
  v_first_kickoff timestamptz;
  v_started_or_latched boolean;
  v_decision_at timestamptz;
  v_changed_fields jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if p_league_id is null
     or p_expected_settings_version is null
     or p_expected_settings_version < 1 then
    raise exception using errcode = 'P0001', message = 'INVALID_LEAGUE_SETTINGS';
  end if;

  -- Normalize and fully validate attacker-controlled payloads before any row
  -- lock. Invalid calls cannot hold a private league or scoring row hostage.
  v_normalized_name := btrim(coalesce(p_name, ''), v_trim_characters);
  v_normalized_description := nullif(
    btrim(coalesce(p_description, ''), v_trim_characters),
    ''
  );
  v_normalized_instructions := nullif(
    btrim(coalesce(p_demo_payment_instructions, ''), v_trim_characters),
    ''
  );

  if char_length(v_normalized_name) not between 3 and 80
     or v_normalized_name ~ '[\x01-\x1F\x7F-\x9F]'
     or position(U&'\2028' in v_normalized_name) > 0
     or position(U&'\2029' in v_normalized_name) > 0
     or (
       v_normalized_description is not null
       and (
         char_length(v_normalized_description) > 500
         or v_normalized_description ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]'
       )
     )
     or p_demo_entry_fee_agorot is null
     or p_demo_entry_fee_agorot < 0
     or (
       v_normalized_instructions is not null
       and (
         char_length(v_normalized_instructions) > 500
         or v_normalized_instructions ~* '(https?://|www\.)'
         or v_normalized_instructions ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]'
       )
     )
     or (
       p_joins_close_at is not null
       and not pg_catalog.isfinite(p_joins_close_at)
     )
     or p_allow_late_join is null then
    raise exception using errcode = 'P0001', message = 'INVALID_LEAGUE_SETTINGS';
  end if;

  if p_exact_points is null
     or p_correct_outcome_points is null
     or p_incorrect_points is null
     or p_exact_points not between 0 and 100
     or p_correct_outcome_points not between 0 and 100
     or p_incorrect_points not between 0 and 100
     or p_exact_points < p_correct_outcome_points
     or p_correct_outcome_points < p_incorrect_points then
    raise exception using errcode = 'P0001', message = 'INVALID_SCORING_RULES';
  end if;

  if p_prizes is null
     or jsonb_typeof(p_prizes) <> 'array'
     or jsonb_array_length(p_prizes) < 1
     or jsonb_array_length(p_prizes) > 100
     or exists (
       select 1
       from jsonb_array_elements(p_prizes) as prize(value)
       where jsonb_typeof(prize.value) <> 'object'
          or (prize.value - 'position' - 'percentage_bps') <> '{}'::jsonb
          or not (prize.value ? 'position')
          or not (prize.value ? 'percentage_bps')
          or jsonb_typeof(prize.value -> 'position') is distinct from 'number'
          or jsonb_typeof(prize.value -> 'percentage_bps') is distinct from 'number'
          or (prize.value ->> 'position') !~ '^[0-9]+$'
          or (prize.value ->> 'percentage_bps') !~ '^[0-9]+$'
     ) then
    raise exception using errcode = 'P0001', message = 'INVALID_PRIZE_RULES';
  end if;

  select count(*)::integer,
         sum((prize.value ->> 'percentage_bps')::integer)::integer,
         count(distinct (prize.value ->> 'position')::integer)::integer,
         min((prize.value ->> 'position')::integer)::integer,
         max((prize.value ->> 'position')::integer)::integer,
         jsonb_agg(
           jsonb_build_object(
             'position', (prize.value ->> 'position')::integer,
             'percentage_bps', (prize.value ->> 'percentage_bps')::integer
           )
           order by (prize.value ->> 'position')::integer
         )
    into v_prize_count, v_prize_total, v_distinct_positions,
         v_minimum_position, v_maximum_position, v_requested_prizes
    from jsonb_array_elements(p_prizes) as prize(value);

  if v_prize_total <> 10000
     or v_distinct_positions <> v_prize_count
     or v_minimum_position <> 1
     or v_maximum_position <> v_prize_count
     or exists (
       select 1
       from jsonb_array_elements(p_prizes) as prize(value)
       where (prize.value ->> 'position')::integer not between 1 and 100
          or (prize.value ->> 'percentage_bps')::integer not between 1 and 10000
     ) then
    raise exception using errcode = 'P0001', message = 'INVALID_PRIZE_RULES';
  end if;

  select league.manager_id
    into v_preflight_manager_id
    from public.leagues as league
    where league.id = p_league_id;

  if not found
     or (
       v_preflight_manager_id <> v_actor_id
       and not exists (
         select 1
         from public.system_admins as administrator
         where administrator.user_id = v_actor_id
       )
     ) then
    raise exception using errcode = 'P0001', message = 'LEAGUE_SETTINGS_NOT_FOUND';
  end if;

  select league.*
    into v_league
    from public.leagues as league
    where league.id = p_league_id
    for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAGUE_SETTINGS_NOT_FOUND';
  end if;

  if v_league.manager_id <> v_actor_id then
    -- Retain system-admin authorization through commit after the league lock.
    -- Revocation either wins first or waits for this mutation to finish.
    perform administrator.user_id
      from public.system_admins as administrator
      where administrator.user_id = v_actor_id
      for key share;
    if not found then
      raise exception using errcode = 'P0001', message = 'LEAGUE_SETTINGS_NOT_FOUND';
    end if;
  end if;

  select scoring.*
    into strict v_scoring
    from public.league_scoring_rules as scoring
    where scoring.league_id = v_league.id
    for update;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'position', prize.position,
               'percentage_bps', prize.percentage_bps
             )
             order by prize.position
           ),
           '[]'::jsonb
         )
    into v_current_prizes
    from public.prize_rules as prize
    where prize.league_id = v_league.id;

  v_details_changed :=
    v_normalized_name is distinct from v_league.name
    or v_normalized_description is distinct from v_league.description
    or p_demo_entry_fee_agorot is distinct from v_league.demo_entry_fee_agorot
    or v_normalized_instructions is distinct from v_league.demo_payment_instructions
    or p_joins_close_at is distinct from v_league.joins_close_at
    or p_allow_late_join is distinct from v_league.allow_late_join;
  v_scoring_changed :=
    p_exact_points is distinct from v_scoring.exact_points
    or p_correct_outcome_points is distinct from v_scoring.correct_outcome_points
    or p_incorrect_points is distinct from v_scoring.incorrect_points;
  v_prizes_changed := v_requested_prizes is distinct from v_current_prizes;
  v_any_changed := v_details_changed or v_scoring_changed or v_prizes_changed;

  if p_expected_settings_version <> v_league.settings_version then
    if not v_any_changed then
      return query select
        v_league.id,
        v_league.settings_version,
        v_scoring.version,
        false;
      return;
    end if;

    raise exception using errcode = 'P0001', message = 'SETTINGS_STALE';
  end if;

  if not v_any_changed then
    return query select
      v_league.id,
      v_league.settings_version,
      v_scoring.version,
      false;
    return;
  end if;

  if v_league.status in ('completed', 'archived') then
    raise exception using errcode = 'P0001', message = 'LEAGUE_SETTINGS_LOCKED';
  end if;

  if v_scoring_changed or v_prizes_changed then
    -- A match insert/update of season_id must retain a foreign-key KEY SHARE
    -- lock on this parent row. FOR UPDATE blocks that phantom first, then the
    -- existing match rows serialize kickoff/latch changes in UUID order.
    perform season.id
      from public.seasons as season
      where season.id = v_league.season_id
      for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'LEAGUE_SETTINGS_NOT_FOUND';
    end if;

    perform match.id
      from public.matches as match
      where match.season_id = v_league.season_id
      order by match.id
      for update;

    select min(match.kickoff_at),
           coalesce(
             bool_or(
               match.predictions_locked_at is not null
               or match.status in ('live', 'finished')
             ),
             false
           )
      into v_first_kickoff, v_started_or_latched
      from public.matches as match
      where match.season_id = v_league.season_id;
  end if;

  v_decision_at := clock_timestamp();

  if (v_scoring_changed or v_prizes_changed)
     and (
       v_scoring.locked_at is not null
       or v_league.status not in ('draft', 'open')
       or v_started_or_latched
       or (v_first_kickoff is not null and v_decision_at >= v_first_kickoff)
     ) then
    raise exception using errcode = 'P0001', message = 'LEAGUE_RULES_LOCKED';
  end if;

  update public.leagues as league
  set name = v_normalized_name,
      description = v_normalized_description,
      demo_entry_fee_agorot = p_demo_entry_fee_agorot,
      demo_payment_instructions = v_normalized_instructions,
      joins_close_at = p_joins_close_at,
      allow_late_join = p_allow_late_join,
      settings_version = league.settings_version + 1
  where league.id = v_league.id
  returning league.settings_version into v_league.settings_version;

  if v_scoring_changed then
    update public.league_scoring_rules as scoring
    set exact_points = p_exact_points,
        correct_outcome_points = p_correct_outcome_points,
        incorrect_points = p_incorrect_points
    where scoring.league_id = v_league.id
    returning scoring.version into v_scoring.version;
  end if;

  if v_prizes_changed then
    delete from public.prize_rules as prize
    where prize.league_id = v_league.id;

    insert into public.prize_rules (league_id, position, percentage_bps)
    select v_league.id,
           (prize.value ->> 'position')::smallint,
           (prize.value ->> 'percentage_bps')::integer
      from jsonb_array_elements(v_requested_prizes) as prize(value)
      order by (prize.value ->> 'position')::integer;
  end if;

  select coalesce(jsonb_agg(change.field order by change.field), '[]'::jsonb)
    into v_changed_fields
    from (
      values
        ('details'::text, v_details_changed),
        ('prizes'::text, v_prizes_changed),
        ('scoring'::text, v_scoring_changed)
    ) as change(field, was_changed)
    where change.was_changed;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata,
    created_at
  )
  values (
    v_actor_id,
    'league_settings_updated',
    'league',
    v_league.id,
    jsonb_build_object(
      'changed_fields', v_changed_fields,
      'settings_version', v_league.settings_version,
      'scoring_version', v_scoring.version
    ),
    v_decision_at
  );

  return query select
    v_league.id,
    v_league.settings_version,
    v_scoring.version,
    true;
exception
  when sqlstate 'P0001' then
    raise;
  when no_data_found then
    raise exception using errcode = 'P0001', message = 'LEAGUE_SETTINGS_NOT_FOUND';
  when check_violation then
    raise exception using errcode = 'P0001', message = 'INVALID_LEAGUE_SETTINGS';
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'INVALID_PRIZE_RULES';
end;
$$;

revoke all on function public.update_league_settings(
  uuid, integer, text, text, integer, text, timestamptz, boolean,
  smallint, smallint, smallint, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.update_league_settings(
  uuid, integer, text, text, integer, text, timestamptz, boolean,
  smallint, smallint, smallint, jsonb
) to authenticated;

comment on function public.update_league_settings(
  uuid, integer, text, text, integer, text, timestamptz, boolean,
  smallint, smallint, smallint, jsonb
) is
  'Atomically replaces the explicit league settings allowlist. Competitive rules use fresh DB time, irreversible match latches, and season/match serialization.';
