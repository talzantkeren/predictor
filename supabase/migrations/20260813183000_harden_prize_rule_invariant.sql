-- Validate both sides if a future privileged operation moves a prize row.
-- Normal authenticated users still have no direct write grants.

create or replace function private.validate_prize_rule_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_league_id uuid;
  prize_count integer;
  prize_total integer;
  minimum_position integer;
  maximum_position integer;
begin
  for target_league_id in
    select distinct league_id
    from unnest(array[old.league_id, new.league_id]) as affected(league_id)
    where league_id is not null
  loop
    if not exists (select 1 from public.leagues where id = target_league_id) then
      continue;
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
  end loop;

  return null;
end;
$$;

revoke all on function private.validate_prize_rule_total() from public, anon, authenticated;
