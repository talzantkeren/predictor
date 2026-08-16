-- Slice 6 review hardening: reject premature finished results and keep
-- standings aggregates viewer-consistent without weakening prediction RLS.

create or replace function public.score_match(
  p_match_id uuid,
  p_status public.match_status,
  p_home_score numeric,
  p_away_score numeric,
  p_is_manual_override boolean,
  p_source text
)
returns table (
  result_match_id uuid,
  result_status public.match_status,
  result_home_score smallint,
  result_away_score smallint,
  result_version integer,
  result_changed boolean,
  predictions_scored integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor_text text;
  v_request_headers jsonb := '{}'::jsonb;
  v_match public.matches%rowtype;
  v_result_home_score smallint;
  v_result_away_score smallint;
  v_result_changed boolean;
  v_override_changed boolean;
  v_result_version integer;
  v_scored_count integer := 0;
  v_at timestamptz;
begin
  begin
    v_request_headers := coalesce(
      nullif(current_setting('request.headers', true), ''),
      '{}'
    )::jsonb;
  exception
    when invalid_text_representation then
      raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end;

  v_actor_text := v_request_headers ->> 'x-predictor-system-actor';
  if v_actor_text is null
     or v_actor_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  v_actor_id := v_actor_text::uuid;
  if not exists (
    select 1
    from public.system_admins as administrator
    where administrator.user_id = v_actor_id
  ) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if p_status is null
     or p_status not in ('finished', 'canceled')
     or p_is_manual_override is null
     or p_source is null
     or p_source <> btrim(p_source)
     or char_length(p_source) not between 2 and 50
     or p_source !~ '^[a-z][a-z0-9_-]+$' then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  if p_status = 'finished' then
    if p_home_score is null
       or p_away_score is null
       or p_home_score <> trunc(p_home_score)
       or p_away_score <> trunc(p_away_score)
       or not (p_home_score between 0 and 30)
       or not (p_away_score between 0 and 30) then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
    end if;

    v_result_home_score := p_home_score::smallint;
    v_result_away_score := p_away_score::smallint;
  elsif p_home_score is not null or p_away_score is not null then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  select match.*
    into v_match
    from public.matches as match
    where match.id = p_match_id
    for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'MATCH_NOT_FOUND';
  end if;

  -- Database time is authoritative and is sampled only after the match lock is
  -- acquired, so a caller that waited across kickoff is judged at mutation time.
  v_at := clock_timestamp();
  if p_status = 'finished' and v_at < v_match.kickoff_at then
    raise exception using errcode = 'P0001', message = 'MATCH_NOT_STARTED';
  end if;

  v_result_changed :=
    v_match.status is distinct from p_status
    or v_match.home_score is distinct from v_result_home_score
    or v_match.away_score is distinct from v_result_away_score;
  v_override_changed :=
    v_match.is_manually_overridden is distinct from p_is_manual_override;
  v_result_version := v_match.result_version + case when v_result_changed then 1 else 0 end;

  if v_result_changed or v_override_changed then
    update public.matches as match
    set status = p_status,
        home_score = v_result_home_score,
        away_score = v_result_away_score,
        result_version = v_result_version,
        is_manually_overridden = p_is_manual_override,
        updated_at = v_at
    where match.id = p_match_id;
  end if;

  -- Deliberately do not lock leagues or league_scoring_rules here. The result
  -- path already owns the match row, while save_prediction locks
  -- leagues -> league_members -> matches. Reading immutable-at-kickoff rules
  -- avoids introducing the reverse match -> league edge.
  if exists (
    select 1
    from public.predictions as prediction
    left join public.league_scoring_rules as rules
      on rules.league_id = prediction.league_id
    where prediction.match_id = p_match_id
      and rules.league_id is null
  ) then
    raise exception using errcode = 'P0001', message = 'SCORING_RULES_MISSING';
  end if;

  with calculated_scores as (
    select
      prediction.id,
      case
        when p_status = 'canceled' then 0::smallint
        when prediction.predicted_home_score = v_result_home_score
         and prediction.predicted_away_score = v_result_away_score
          then rules.exact_points
        when prediction.predicted_outcome = case
          when v_result_home_score > v_result_away_score then 'HOME'::public.outcome
          when v_result_home_score < v_result_away_score then 'AWAY'::public.outcome
          else 'DRAW'::public.outcome
        end then rules.correct_outcome_points
        else rules.incorrect_points
      end as calculated_points,
      case
        when p_status = 'canceled' then false
        else prediction.predicted_home_score = v_result_home_score
          and prediction.predicted_away_score = v_result_away_score
      end as calculated_exact,
      case
        when p_status = 'canceled' then false
        else prediction.predicted_outcome = case
          when v_result_home_score > v_result_away_score then 'HOME'::public.outcome
          when v_result_home_score < v_result_away_score then 'AWAY'::public.outcome
          else 'DRAW'::public.outcome
        end
      end as calculated_correct_outcome,
      rules.version as rule_version
    from public.predictions as prediction
    join public.league_scoring_rules as rules
      on rules.league_id = prediction.league_id
    where prediction.match_id = p_match_id
  )
  update public.predictions as prediction
  set points = calculated.calculated_points,
      is_exact = calculated.calculated_exact,
      is_correct_outcome = calculated.calculated_correct_outcome,
      scored_at = v_at,
      scored_result_version = v_result_version,
      scored_rule_version = calculated.rule_version
  from calculated_scores as calculated
  where prediction.id = calculated.id
    and (
      prediction.points is distinct from calculated.calculated_points
      or prediction.is_exact is distinct from calculated.calculated_exact
      or prediction.is_correct_outcome is distinct from calculated.calculated_correct_outcome
      or prediction.scored_result_version is distinct from v_result_version
      or prediction.scored_rule_version is distinct from calculated.rule_version
      or prediction.scored_at is null
    );

  get diagnostics v_scored_count = row_count;

  if v_result_changed or v_override_changed or v_scored_count > 0 then
    insert into public.audit_logs (
      actor_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      v_actor_id,
      case
        when p_status = 'canceled' and v_result_changed then 'match_result_canceled'
        when v_result_changed and v_match.result_version > 0 then 'match_result_corrected'
        when v_result_changed then 'match_result_applied'
        when v_override_changed then 'match_override_changed'
        else 'match_scoring_recomputed'
      end,
      'match_result',
      p_match_id,
      jsonb_build_object(
        'source', p_source,
        'status', p_status,
        'home_score', v_result_home_score,
        'away_score', v_result_away_score,
        'result_version', v_result_version,
        'result_changed', v_result_changed,
        'manual_override', p_is_manual_override,
        'predictions_scored', v_scored_count
      )
    );
  end if;

  return query
  select
    p_match_id,
    p_status,
    v_result_home_score,
    v_result_away_score,
    v_result_version,
    v_result_changed,
    v_scored_count;
end;
$$;

revoke all on function public.score_match(
  uuid, public.match_status, numeric, numeric, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.score_match(
  uuid, public.match_status, numeric, numeric, boolean, text
) to service_role;

comment on function public.score_match(
  uuid, public.match_status, numeric, numeric, boolean, text
) is
  'Atomically applies a post-kickoff system result and deterministically overwrites scoring for every league without taking a league row lock.';

create or replace view public.league_leaderboard
with (security_invoker = true)
as
with member_totals as (
  select
    member.league_id,
    member.user_id,
    coalesce(profile.display_name, 'משתתף') as display_name,
    coalesce(
      sum(prediction.points) filter (
        where match.kickoff_at <= now()
      ),
      0
    )::bigint as total_points,
    count(prediction.id) filter (
      where match.kickoff_at <= now()
        and prediction.is_correct_outcome is true
    )::bigint as correct_outcomes,
    count(prediction.id) filter (
      where match.kickoff_at <= now()
        and prediction.is_exact is true
    )::bigint as exact_scores,
    count(prediction.id) filter (
      where match.kickoff_at <= now()
    )::bigint as predictions_submitted
  from public.league_members as member
  left join public.profiles as profile
    on profile.id = member.user_id
  left join public.predictions as prediction
    on prediction.league_id = member.league_id
   and prediction.user_id = member.user_id
  left join public.matches as match
    on match.id = prediction.match_id
  where member.status = 'active'
  group by member.league_id, member.user_id, profile.display_name
)
select
  totals.league_id,
  totals.user_id,
  totals.display_name,
  totals.total_points,
  totals.correct_outcomes,
  totals.exact_scores,
  totals.predictions_submitted,
  rank() over (
    partition by totals.league_id
    order by totals.total_points desc, totals.correct_outcomes desc
  ) as rank
from member_totals as totals;

revoke all on table public.league_leaderboard
  from public, anon, authenticated, service_role;
grant select on table public.league_leaderboard to authenticated;

comment on view public.league_leaderboard is
  'RLS-preserving active-member standings. Aggregates include only predictions whose kickoff has passed and use competition rank by points and correct outcomes.';
