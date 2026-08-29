-- Slice 9 privacy-safe, read-only active-member directory.

create function public.get_active_league_members_page(
  p_league_id uuid,
  p_cursor_approved_at timestamptz default null,
  p_cursor_membership_id uuid default null,
  p_page_size integer default 25
)
returns table (
  membership_id uuid,
  display_name text,
  approved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'UNAUTHENTICATED';
  end if;
  if p_league_id is null
     or p_page_size is null
     or p_page_size not between 1 and 50
     or (p_cursor_approved_at is null) <> (p_cursor_membership_id is null)
     or (
       p_cursor_approved_at is not null
       and not pg_catalog.isfinite(p_cursor_approved_at)
     ) then
    raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR';
  end if;

  if not exists (
    select 1
    from public.leagues as league
    where league.id = p_league_id
      and (
        league.manager_id = v_actor_id
        or private.is_active_league_member(league.id)
      )
  ) then
    raise exception using errcode = 'P0001', message = 'MEMBERS_NOT_FOUND';
  end if;

  return query
  select
    member.id,
    coalesce(profile.display_name, 'משתתף'),
    member.approved_at
  from public.league_members as member
  left join public.profiles as profile on profile.id = member.user_id
  where member.league_id = p_league_id
    and member.status = 'active'
    and (
      p_cursor_approved_at is null
      or (member.approved_at, member.id)
        > (p_cursor_approved_at, p_cursor_membership_id)
    )
  order by member.approved_at, member.id
  limit p_page_size + 1;
end;
$$;

revoke all on function public.get_active_league_members_page(
  uuid, timestamptz, uuid, integer
) from public, anon, authenticated, service_role;
grant execute on function public.get_active_league_members_page(
  uuid, timestamptz, uuid, integer
) to authenticated;

comment on function public.get_active_league_members_page(
  uuid, timestamptz, uuid, integer
) is
  'Authorized manager/active-member keyset page containing only membership ID, display name, and approval time. No email, auth metadata, proof data, removal or reactivation surface.';
