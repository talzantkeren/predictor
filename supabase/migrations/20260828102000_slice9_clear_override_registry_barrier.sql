-- Manual-override handoff discovers and locks every league on the match
-- season before it decides whether completed reconciliation is required.
-- Serialize that discovery with league creation so a newly committed league
-- cannot appear in the later READ COMMITTED completion check without having
-- participated in the protected set.

alter function public.clear_manual_match_override(uuid)
  rename to slice9_clear_manual_match_override_without_registry_barrier;

alter function public.slice9_clear_manual_match_override_without_registry_barrier(uuid)
  set schema private;

revoke all on function private.slice9_clear_manual_match_override_without_registry_barrier(uuid)
  from public, anon, authenticated, service_role;

comment on function private.slice9_clear_manual_match_override_without_registry_barrier(uuid) is
  'Existing authorized manual-override handoff behind the public registry barrier. It has no Data API grant and retains the verified actor after its league-row wait.';

create function public.clear_manual_match_override(p_match_id uuid)
returns table (
  result_match_id uuid,
  result_status public.match_status,
  result_home_score smallint,
  result_away_score smallint,
  result_version integer,
  result_external_provider text,
  result_cleared boolean,
  result_manual_override boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.slice9_system_actor_from_request();
  perform pg_catalog.pg_advisory_xact_lock(2026090609);

  return query
  select result.*
  from private.slice9_clear_manual_match_override_without_registry_barrier(
    p_match_id
  ) as result;
end;
$$;

revoke all on function public.clear_manual_match_override(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.clear_manual_match_override(uuid)
  to service_role;

comment on function public.clear_manual_match_override(uuid) is
  'Service-only manual-override handoff: validates the system actor, takes the exclusive league-registry barrier before season discovery, then delegates the existing league-row-locked and actor-retained mutation.';
