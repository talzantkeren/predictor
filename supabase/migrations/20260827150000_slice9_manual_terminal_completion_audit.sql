-- Align the product Manual terminal-result path with the lifecycle completion
-- gate. The scoring core writes match_result_applied; completion intentionally
-- requires the bounded system-editor decision event for the same version.

alter function public.create_or_correct_match(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) rename to slice9_create_or_correct_match_without_terminal_audit;

alter function public.slice9_create_or_correct_match_without_terminal_audit(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) set schema private;

revoke all on function private.slice9_create_or_correct_match_without_terminal_audit(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) from public, anon, authenticated, service_role;

create function public.create_or_correct_match(
  p_operation text,
  p_match_id uuid,
  p_season_id uuid,
  p_home_team_id uuid,
  p_away_team_id uuid,
  p_round_number numeric,
  p_kickoff_at timestamptz,
  p_status public.match_status,
  p_home_score numeric,
  p_away_score numeric
)
returns table (
  result_match_id uuid,
  result_status public.match_status,
  result_home_score smallint,
  result_away_score smallint,
  result_version integer,
  result_created boolean,
  result_changed boolean,
  result_manual_override boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.slice9_system_actor_from_request();
  v_result record;
begin
  select * into strict v_result
  from private.slice9_create_or_correct_match_without_terminal_audit(
    p_operation,
    p_match_id,
    p_season_id,
    p_home_team_id,
    p_away_team_id,
    p_round_number,
    p_kickoff_at,
    p_status,
    p_home_score,
    p_away_score
  );

  if p_operation = 'correct'
     and v_result.result_changed
     and v_result.result_manual_override
     and v_result.result_status in ('finished', 'canceled')
     and not exists (
       select 1
       from public.audit_logs as audit
       where audit.entity_id = v_result.result_match_id
         and audit.entity_type = 'match'
         and audit.action = 'match_manually_corrected'
         and audit.metadata ->> 'result_version' =
           v_result.result_version::text
     ) then
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, metadata
    ) values (
      v_actor_id,
      'match_manually_corrected',
      'match',
      v_result.result_match_id,
      jsonb_build_object(
        'source', 'manual-match',
        'status', v_result.result_status,
        'home_score', v_result.result_home_score,
        'away_score', v_result.result_away_score,
        'result_version', v_result.result_version,
        'completion_gate_eligible', true
      )
    );
  end if;

  return query select
    v_result.result_match_id,
    v_result.result_status,
    v_result.result_home_score,
    v_result.result_away_score,
    v_result.result_version,
    v_result.result_created,
    v_result.result_changed,
    v_result.result_manual_override;
end;
$$;

revoke all on function public.create_or_correct_match(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) from public, anon, authenticated, service_role;
grant execute on function public.create_or_correct_match(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) to service_role;

comment on function public.create_or_correct_match(
  text, uuid, uuid, uuid, uuid, numeric, timestamptz,
  public.match_status, numeric, numeric
) is
  'Fixed system-only Manual editor: delegates the lifecycle-aware mutation and records one version-bound terminal Manual decision required by completion.';

-- Preserve completion for an active league whose terminal Manual result was
-- entered through the product before this forward migration was installed.
insert into public.audit_logs (
  actor_id, action, entity_type, entity_id, metadata, created_at
)
select
  source.actor_id,
  'match_manually_corrected',
  'match',
  source.entity_id,
  source.metadata || jsonb_build_object(
    'completion_gate_eligible', true,
    'derived_from_action', 'match_result_applied'
  ),
  source.created_at
from public.audit_logs as source
join public.matches as match on match.id = source.entity_id
where source.entity_type = 'match'
  and source.action = 'match_result_applied'
  and source.metadata ->> 'source' = 'manual-match'
  and source.metadata ->> 'result_version' = match.result_version::text
  and match.is_manually_overridden
  and not exists (
    select 1
    from public.audit_logs as existing
    where existing.entity_id = source.entity_id
      and existing.entity_type = 'match'
      and existing.action = 'match_manually_corrected'
      and existing.metadata ->> 'result_version' =
        source.metadata ->> 'result_version'
  );

