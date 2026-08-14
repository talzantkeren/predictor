-- Slice 2 leagues: league settings, per-league scoring, Demo prizes,
-- minimal creator membership, non-recursive RLS, and atomic creation.

do $$
begin
  create type public.league_status as enum (
    'draft',
    'open',
    'active',
    'completed',
    'archived'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.member_status as enum ('active', 'removed');
exception
  when duplicate_object then null;
end
$$;

create table public.leagues (
  id uuid primary key default extensions.gen_random_uuid(),
  manager_id uuid not null references auth.users(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  name text not null,
  description text,
  status public.league_status not null default 'draft',
  demo_entry_fee_agorot integer not null default 0,
  demo_payment_instructions text,
  joins_close_at timestamptz,
  allow_late_join boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leagues_name_trimmed_check check (
    name = btrim(name, U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
  ),
  constraint leagues_name_length_check check (char_length(name) between 3 and 80),
  constraint leagues_description_check check (
    description is null
    or (
      description = btrim(description, U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
      and char_length(description) between 1 and 500
    )
  ),
  constraint leagues_demo_entry_fee_check check (demo_entry_fee_agorot >= 0),
  constraint leagues_demo_payment_instructions_check check (
    demo_payment_instructions is null
    or (
      demo_payment_instructions = btrim(demo_payment_instructions, U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
      and char_length(demo_payment_instructions) between 1 and 500
      and demo_payment_instructions !~* '(https?://|www\.)'
    )
  )
);

create index leagues_manager_idx on public.leagues (manager_id);
create index leagues_season_idx on public.leagues (season_id);

create table public.league_scoring_rules (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  exact_points smallint not null default 3,
  correct_outcome_points smallint not null default 1,
  incorrect_points smallint not null default 0,
  version integer not null default 1,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_scoring_rules_points_range_check check (
    exact_points between 0 and 100
    and correct_outcome_points between 0 and 100
    and incorrect_points between 0 and 100
  ),
  constraint league_scoring_rules_order_check check (
    exact_points >= correct_outcome_points
    and correct_outcome_points >= incorrect_points
  ),
  constraint league_scoring_rules_version_check check (version > 0)
);

create table public.prize_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  position smallint not null,
  percentage_bps integer not null,
  created_at timestamptz not null default now(),
  constraint prize_rules_position_check check (position > 0),
  constraint prize_rules_percentage_bps_check check (percentage_bps between 1 and 10000),
  constraint prize_rules_league_position_key unique (league_id, position)
);

create index prize_rules_league_idx on public.prize_rules (league_id);

create table public.league_members (
  id uuid primary key default extensions.gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  status public.member_status not null default 'active',
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  removed_by uuid references auth.users(id) on delete restrict,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_members_league_user_key unique (league_id, user_id),
  constraint league_members_lifecycle_check check (
    (status = 'active' and removed_by is null and removed_at is null)
    or (status = 'removed' and removed_by is not null and removed_at is not null)
  )
);

create index league_members_user_status_idx
  on public.league_members (user_id, status, league_id);
create index league_members_league_status_idx
  on public.league_members (league_id, status);

comment on table public.leagues is 'Private Demo leagues. Creation is available only through create_league().';
comment on column public.leagues.demo_entry_fee_agorot is 'Demo-only amount in integer agorot; it is not money held by the application.';
comment on column public.leagues.demo_payment_instructions is 'Demo-only plain text. URLs are rejected and the UI never renders a payment link.';
comment on table public.league_members is 'Minimal Slice 2 membership model for the creator. General membership workflows arrive later.';

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create function private.is_active_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.league_members
    where league_id = p_league_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create function private.is_league_manager(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.leagues
    where id = p_league_id
      and manager_id = auth.uid()
  );
$$;

create function private.shares_active_league(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.league_members as mine
    join public.league_members as theirs
      on theirs.league_id = mine.league_id
     and theirs.status = 'active'
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.user_id = p_other_user_id
  );
$$;

revoke all on function private.is_active_league_member(uuid) from public, anon, authenticated;
revoke all on function private.is_league_manager(uuid) from public, anon, authenticated;
revoke all on function private.shares_active_league(uuid) from public, anon, authenticated;
grant execute on function private.is_active_league_member(uuid) to authenticated;
grant execute on function private.is_league_manager(uuid) to authenticated;
grant execute on function private.shares_active_league(uuid) to authenticated;

create function private.enforce_scoring_rule_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  first_kickoff timestamptz;
  scoring_changed boolean;
begin
  scoring_changed :=
    new.exact_points is distinct from old.exact_points
    or new.correct_outcome_points is distinct from old.correct_outcome_points
    or new.incorrect_points is distinct from old.incorrect_points;

  if old.locked_at is not null and new.locked_at is distinct from old.locked_at then
    raise exception using errcode = 'P0001', message = 'SCORING_RULES_LOCKED';
  end if;

  if scoring_changed then
    select min(public.matches.kickoff_at)
      into first_kickoff
      from public.leagues
      left join public.matches on public.matches.season_id = public.leagues.season_id
      where public.leagues.id = old.league_id;

    if old.locked_at is not null or (first_kickoff is not null and now() >= first_kickoff) then
      raise exception using errcode = 'P0001', message = 'SCORING_RULES_LOCKED';
    end if;

    new.version := old.version + 1;
    new.updated_at := now();
  elsif new.version is distinct from old.version then
    raise exception using errcode = 'P0001', message = 'SCORING_RULE_VERSION_INVALID';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_scoring_rule_lock() from public, anon, authenticated;

create trigger league_scoring_rules_enforce_lock
before update on public.league_scoring_rules
for each row execute function private.enforce_scoring_rule_lock();

create function private.validate_prize_rule_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_league_id uuid := coalesce(new.league_id, old.league_id);
  prize_count integer;
  prize_total integer;
  minimum_position integer;
  maximum_position integer;
begin
  if not exists (select 1 from public.leagues where id = target_league_id) then
    return null;
  end if;

  select count(*)::integer, coalesce(sum(percentage_bps), 0)::integer,
         min(position)::integer, max(position)::integer
    into prize_count, prize_total, minimum_position, maximum_position
    from public.prize_rules
    where league_id = target_league_id;

  if prize_count < 1
     or prize_total <> 10000
     or minimum_position <> 1
     or maximum_position <> prize_count then
    raise exception using errcode = 'P0001', message = 'INVALID_PRIZE_RULES';
  end if;

  return null;
end;
$$;

revoke all on function private.validate_prize_rule_total() from public, anon, authenticated;

create constraint trigger prize_rules_validate_total
after insert or update or delete on public.prize_rules
deferrable initially deferred
for each row execute function private.validate_prize_rule_total();

alter table public.leagues enable row level security;
alter table public.league_scoring_rules enable row level security;
alter table public.prize_rules enable row level security;
alter table public.league_members enable row level security;

revoke all on table public.leagues, public.league_scoring_rules, public.prize_rules, public.league_members
  from public, anon, authenticated;
grant select on table public.leagues, public.league_scoring_rules, public.prize_rules, public.league_members
  to authenticated;

create policy leagues_member_read
  on public.leagues for select to authenticated
  using (
    manager_id = (select auth.uid())
    or private.is_active_league_member(id)
  );

create policy league_scoring_rules_member_read
  on public.league_scoring_rules for select to authenticated
  using (private.is_active_league_member(league_id));

create policy prize_rules_member_read
  on public.prize_rules for select to authenticated
  using (private.is_active_league_member(league_id));

create policy league_members_authorized_read
  on public.league_members for select to authenticated
  using (
    (status = 'active' and private.is_active_league_member(league_id))
    or private.is_league_manager(league_id)
  );

drop policy profiles_select_own on public.profiles;
create policy profiles_select_authorized
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or private.shares_active_league(id)
  );

create function public.create_league(
  p_season_id uuid,
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
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  new_league_id uuid := extensions.gen_random_uuid();
  normalized_name text;
  normalized_description text;
  normalized_instructions text;
  trim_characters constant text := U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  prize_count integer;
  prize_total integer;
  distinct_positions integer;
  minimum_position integer;
  maximum_position integer;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;

  if not exists (select 1 from public.seasons where id = p_season_id) then
    raise exception using errcode = 'P0001', message = 'INVALID_SEASON';
  end if;

  normalized_name := btrim(coalesce(p_name, ''), trim_characters);
  normalized_description := nullif(btrim(coalesce(p_description, ''), trim_characters), '');
  normalized_instructions := nullif(btrim(coalesce(p_demo_payment_instructions, ''), trim_characters), '');

  if char_length(normalized_name) not between 3 and 80
     or (normalized_description is not null and char_length(normalized_description) > 500)
     or p_demo_entry_fee_agorot is null
     or p_demo_entry_fee_agorot < 0
     or (normalized_instructions is not null and char_length(normalized_instructions) > 500)
     or (normalized_instructions is not null and normalized_instructions ~* '(https?://|www\.)')
     or p_allow_late_join is null then
    raise exception using errcode = 'P0001', message = 'INVALID_LEAGUE';
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
          or jsonb_typeof(prize.value -> 'position') <> 'number'
          or jsonb_typeof(prize.value -> 'percentage_bps') <> 'number'
          or (prize.value ->> 'position') !~ '^[0-9]+$'
          or (prize.value ->> 'percentage_bps') !~ '^[0-9]+$'
     ) then
    raise exception using errcode = 'P0001', message = 'INVALID_PRIZE_RULES';
  end if;

  select count(*)::integer,
         sum((prize.value ->> 'percentage_bps')::integer)::integer,
         count(distinct (prize.value ->> 'position')::integer)::integer,
         min((prize.value ->> 'position')::integer)::integer,
         max((prize.value ->> 'position')::integer)::integer
    into prize_count, prize_total, distinct_positions, minimum_position, maximum_position
    from jsonb_array_elements(p_prizes) as prize(value);

  if prize_total <> 10000
     or distinct_positions <> prize_count
     or minimum_position <> 1
     or maximum_position <> prize_count
     or exists (
       select 1
       from jsonb_array_elements(p_prizes) as prize(value)
       where (prize.value ->> 'position')::integer < 1
          or (prize.value ->> 'percentage_bps')::integer not between 1 and 10000
     ) then
    raise exception using errcode = 'P0001', message = 'INVALID_PRIZE_RULES';
  end if;

  insert into public.leagues (
    id,
    manager_id,
    season_id,
    name,
    description,
    demo_entry_fee_agorot,
    demo_payment_instructions,
    joins_close_at,
    allow_late_join
  )
  values (
    new_league_id,
    actor_id,
    p_season_id,
    normalized_name,
    normalized_description,
    p_demo_entry_fee_agorot,
    normalized_instructions,
    p_joins_close_at,
    p_allow_late_join
  );

  insert into public.league_scoring_rules (
    league_id,
    exact_points,
    correct_outcome_points,
    incorrect_points
  )
  values (
    new_league_id,
    p_exact_points,
    p_correct_outcome_points,
    p_incorrect_points
  );

  insert into public.prize_rules (league_id, position, percentage_bps)
  select new_league_id,
         (prize.value ->> 'position')::smallint,
         (prize.value ->> 'percentage_bps')::integer
    from jsonb_array_elements(p_prizes) as prize(value)
    order by (prize.value ->> 'position')::integer;

  insert into public.league_members (
    league_id,
    user_id,
    status,
    approved_by,
    approved_at
  )
  values (
    new_league_id,
    actor_id,
    'active',
    actor_id,
    now()
  );

  return new_league_id;
exception
  when sqlstate 'P0001' then
    raise;
  when foreign_key_violation or check_violation or unique_violation or invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'INVALID_LEAGUE';
end;
$$;

revoke all on function public.create_league(
  uuid, text, text, integer, text, timestamptz, boolean, smallint, smallint, smallint, jsonb
) from public, anon, authenticated;
grant execute on function public.create_league(
  uuid, text, text, integer, text, timestamptz, boolean, smallint, smallint, smallint, jsonb
) to authenticated;
