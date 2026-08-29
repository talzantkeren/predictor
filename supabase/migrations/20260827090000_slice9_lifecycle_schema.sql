-- Slice 9 lifecycle persistence: frozen league results, durable match-result
-- review, and explicit completed-league reconciliation. Runtime mutations are
-- added by forward migrations after these exposed tables and policies exist.

do $$
begin
  create type public.match_result_review_disposition as enum (
    'pending',
    'resolved'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.league_match_reconciliation_disposition as enum (
    'pending',
    'applied',
    'dismissed'
  );
exception
  when duplicate_object then null;
end
$$;

alter table public.matches
  add column requires_review boolean not null default false,
  add column review_code text,
  add column review_result_version integer,
  add constraint matches_review_code_check check (
    review_code is null
    or (
      review_code = btrim(review_code)
      and char_length(review_code) between 3 and 64
      and review_code ~ '^[A-Z][A-Z0-9_]+$'
    )
  ),
  add constraint matches_review_result_version_check check (
    review_result_version is null or review_result_version >= 0
  ),
  add constraint matches_review_shape_check check (
    (
      requires_review
      and review_code is not null
      and review_result_version is not null
    )
    or (
      not requires_review
      and review_code is null
      and review_result_version is null
    )
  );

comment on column public.matches.requires_review is
  'Durable gate for a provider result that cannot be scored or completed until an explicit system-admin review is resolved.';
comment on column public.matches.review_code is
  'Stable safe reason code for the current unresolved result review.';
comment on column public.matches.review_result_version is
  'Match result version owned by the current unresolved review; stale review decisions must not clear a newer version.';

create table public.match_result_reviews (
  match_id uuid not null references public.matches(id) on delete restrict,
  result_version integer not null,
  provider_status text not null,
  candidate_home_score smallint,
  candidate_away_score smallint,
  disposition public.match_result_review_disposition not null default 'pending',
  selected_status public.match_status,
  selected_home_score smallint,
  selected_away_score smallint,
  applied_result_version integer,
  decided_by uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint match_result_reviews_pkey primary key (match_id, result_version),
  constraint match_result_reviews_result_version_check check (
    result_version >= 0
  ),
  constraint match_result_reviews_provider_status_check check (
    provider_status = btrim(provider_status)
    and char_length(provider_status) between 1 and 10
    and provider_status ~ '^[A-Z0-9]+$'
  ),
  constraint match_result_reviews_candidate_score_check check (
    (
      candidate_home_score is null
      and candidate_away_score is null
    )
    or (
      candidate_home_score between 0 and 30
      and candidate_away_score between 0 and 30
    )
  ),
  constraint match_result_reviews_decision_shape_check check (
    (
      disposition = 'pending'
      and selected_status is null
      and selected_home_score is null
      and selected_away_score is null
      and applied_result_version is null
      and decided_by is null
      and decided_at is null
    )
    or (
      disposition = 'resolved'
      and selected_status in ('finished', 'canceled')
      and (
        (
          selected_status = 'finished'
          and selected_home_score between 0 and 30
          and selected_away_score between 0 and 30
        )
        or (
          selected_status = 'canceled'
          and selected_home_score is null
          and selected_away_score is null
        )
      )
      and applied_result_version = result_version + 1
      and decided_by is not null
      and decided_at is not null
      and isfinite(decided_at)
      and decided_at >= created_at
    )
  ),
  constraint match_result_reviews_created_at_check check (isfinite(created_at))
);

create index match_result_reviews_pending_created_idx
  on public.match_result_reviews (created_at, match_id, result_version)
  where disposition = 'pending';

comment on table public.match_result_reviews is
  'Versioned provider-result candidates requiring an explicit system-admin legal-time or cancellation decision. Direct user-role mutation is forbidden.';

create table public.league_match_snapshots (
  league_id uuid not null references public.leagues(id) on delete restrict,
  match_id uuid not null references public.matches(id) on delete restrict,
  completed_status public.match_status not null,
  completed_home_score smallint,
  completed_away_score smallint,
  completed_result_version integer not null,
  completed_at timestamptz not null,
  constraint league_match_snapshots_pkey primary key (league_id, match_id),
  constraint league_match_snapshots_terminal_result_check check (
    (
      completed_status = 'finished'
      and completed_home_score between 0 and 30
      and completed_away_score between 0 and 30
    )
    or (
      completed_status = 'canceled'
      and completed_home_score is null
      and completed_away_score is null
    )
  ),
  constraint league_match_snapshots_result_version_check check (
    completed_result_version >= 0
  ),
  constraint league_match_snapshots_completed_at_check check (
    isfinite(completed_at)
  )
);

create index league_match_snapshots_match_idx
  on public.league_match_snapshots (match_id, league_id);

comment on table public.league_match_snapshots is
  'The immutable included fixture set and terminal result frozen by league completion. Only explicit reconciliation may update an existing row.';

create table public.league_match_reconciliations (
  id uuid primary key default extensions.gen_random_uuid(),
  league_id uuid not null,
  match_id uuid not null,
  result_version integer not null,
  candidate_status public.match_status not null,
  candidate_home_score smallint,
  candidate_away_score smallint,
  disposition public.league_match_reconciliation_disposition not null
    default 'pending',
  created_by uuid not null references auth.users(id) on delete restrict,
  decided_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint league_match_reconciliations_snapshot_fkey
    foreign key (league_id, match_id)
    references public.league_match_snapshots(league_id, match_id)
    on delete restrict,
  constraint league_match_reconciliations_result_key unique (
    league_id, match_id, result_version
  ),
  constraint league_match_reconciliations_result_version_check check (
    result_version >= 0
  ),
  constraint league_match_reconciliations_candidate_result_check check (
    (
      candidate_status = 'finished'
      and candidate_home_score between 0 and 30
      and candidate_away_score between 0 and 30
    )
    or (
      candidate_status = 'canceled'
      and candidate_home_score is null
      and candidate_away_score is null
    )
  ),
  constraint league_match_reconciliations_decision_shape_check check (
    (
      disposition = 'pending'
      and decided_by is null
      and decided_at is null
    )
    or (
      disposition in ('applied', 'dismissed')
      and decided_by is not null
      and decided_at is not null
      and isfinite(decided_at)
      and decided_at >= created_at
    )
  ),
  constraint league_match_reconciliations_created_at_check check (
    isfinite(created_at)
  )
);

create index league_match_reconciliations_pending_created_idx
  on public.league_match_reconciliations (created_at, id)
  where disposition = 'pending';

create index league_match_reconciliations_match_version_idx
  on public.league_match_reconciliations (
    match_id, result_version, league_id
  );

comment on table public.league_match_reconciliations is
  'Durable league-scoped queue for explicit application or dismissal of a corrected canonical result after completion. The composite foreign key excludes post-completion fixtures.';

alter table public.match_result_reviews enable row level security;
alter table public.league_match_snapshots enable row level security;
alter table public.league_match_reconciliations enable row level security;

revoke all on table public.match_result_reviews,
  public.league_match_snapshots,
  public.league_match_reconciliations
from public, anon, authenticated, service_role;

grant select on table public.match_result_reviews,
  public.league_match_reconciliations
to authenticated;

grant select on table public.league_match_snapshots to authenticated;

create policy match_result_reviews_system_admin_read
  on public.match_result_reviews
  for select
  to authenticated
  using ((select public.is_system_admin()));

create policy league_match_snapshots_authorized_read
  on public.league_match_snapshots
  for select
  to authenticated
  using (
    private.is_league_manager(league_id)
    or private.is_active_league_member(league_id)
  );

create policy league_match_reconciliations_system_admin_read
  on public.league_match_reconciliations
  for select
  to authenticated
  using ((select public.is_system_admin()));
