-- Slice 2 prerequisite: the global sports catalog required by leagues.
-- Fixtures and provider identifiers intentionally remain empty until a verified seed/adapter supplies them.

create table public.competitions (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  slug text not null,
  country_code text not null,
  external_provider text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitions_name_trimmed_check check (name = btrim(name)),
  constraint competitions_name_length_check check (char_length(name) between 2 and 100),
  constraint competitions_slug_format_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint competitions_country_code_check check (country_code ~ '^[A-Z]{2}$'),
  constraint competitions_external_identity_check check (
    (external_provider is null and external_id is null)
    or (external_provider is not null and external_id is not null)
  ),
  constraint competitions_slug_key unique (slug)
);

create unique index competitions_external_identity_key
  on public.competitions (external_provider, external_id)
  where external_provider is not null and external_id is not null;

create table public.seasons (
  id uuid primary key default extensions.gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete restrict,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_name_trimmed_check check (name = btrim(name)),
  constraint seasons_name_length_check check (char_length(name) between 2 and 30),
  constraint seasons_date_order_check check (starts_on < ends_on),
  constraint seasons_competition_name_key unique (competition_id, name)
);

create index seasons_current_catalog_idx
  on public.seasons (is_current, starts_on desc)
  where is_current;

create table public.teams (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  short_name text,
  logo_url text,
  external_provider text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_name_trimmed_check check (name = btrim(name)),
  constraint teams_name_length_check check (char_length(name) between 2 and 100),
  constraint teams_short_name_check check (
    short_name is null
    or (short_name = btrim(short_name) and char_length(short_name) between 2 and 30)
  ),
  constraint teams_external_identity_check check (
    (external_provider is null and external_id is null)
    or (external_provider is not null and external_id is not null)
  )
);

create unique index teams_external_identity_key
  on public.teams (external_provider, external_id)
  where external_provider is not null and external_id is not null;

create table public.matches (
  id uuid primary key default extensions.gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  round_number smallint not null,
  home_team_id uuid not null references public.teams(id) on delete restrict,
  away_team_id uuid not null references public.teams(id) on delete restrict,
  kickoff_at timestamptz not null,
  status public.match_status not null default 'scheduled',
  home_score smallint,
  away_score smallint,
  result_version integer not null default 0,
  is_manually_overridden boolean not null default false,
  external_provider text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_round_number_check check (round_number > 0),
  constraint matches_distinct_teams_check check (home_team_id <> away_team_id),
  constraint matches_home_score_check check (home_score between 0 and 30),
  constraint matches_away_score_check check (away_score between 0 and 30),
  constraint matches_score_status_check check (
    (status = 'finished' and home_score is not null and away_score is not null)
    or (status <> 'finished' and home_score is null and away_score is null)
  ),
  constraint matches_result_version_check check (result_version >= 0),
  constraint matches_external_identity_check check (
    (external_provider is null and external_id is null)
    or (external_provider is not null and external_id is not null)
  )
);

create unique index matches_external_identity_key
  on public.matches (external_provider, external_id)
  where external_provider is not null and external_id is not null;

create index matches_season_kickoff_idx
  on public.matches (season_id, kickoff_at);

create index matches_status_kickoff_idx
  on public.matches (status, kickoff_at);

comment on table public.competitions is 'Global competition catalog. Authenticated read-only through the Data API.';
comment on table public.seasons is 'Global season catalog. Authenticated read-only through the Data API.';
comment on table public.teams is 'Global team catalog. Authenticated read-only through the Data API.';
comment on table public.matches is 'Global match data. This Slice 2 prerequisite contains no invented fixtures or results.';

alter table public.competitions enable row level security;
alter table public.seasons enable row level security;
alter table public.teams enable row level security;
alter table public.matches enable row level security;

revoke all on table public.competitions, public.seasons, public.teams, public.matches
  from public, anon, authenticated;
grant select on table public.competitions, public.seasons, public.teams, public.matches
  to authenticated;

create policy competitions_authenticated_read
  on public.competitions for select to authenticated using (true);
create policy seasons_authenticated_read
  on public.seasons for select to authenticated using (true);
create policy teams_authenticated_read
  on public.teams for select to authenticated using (true);
create policy matches_authenticated_read
  on public.matches for select to authenticated using (true);
