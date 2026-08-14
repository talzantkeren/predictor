-- Slice 2 audit hardening (forward-only):
-- 1. Managers keep read access to their league's scoring and prize rules even
--    without an active membership row, matching the documented member/manager
--    read contract. Unrelated users still read nothing.
-- 2. Control characters are rejected in league text fields. League names are
--    single-line; the multiline Demo fields keep tab and line breaks only.
-- 3. leagues, league_members, and league_scoring_rules maintain updated_at in
--    the database on every update.
-- 4. The redundant prize_rules league index is removed; the unique
--    (league_id, position) index already serves the same lookups.
-- 5. create_league execution is narrowed to authenticated only.

drop policy league_scoring_rules_member_read on public.league_scoring_rules;
create policy league_scoring_rules_authorized_read
  on public.league_scoring_rules for select to authenticated
  using (
    private.is_active_league_member(league_id)
    or private.is_league_manager(league_id)
  );

drop policy prize_rules_member_read on public.prize_rules;
create policy prize_rules_authorized_read
  on public.prize_rules for select to authenticated
  using (
    private.is_active_league_member(league_id)
    or private.is_league_manager(league_id)
  );

-- Clean any pre-existing control characters before constraining, mirroring the
-- display-name hardening precedent. The nullable Demo fields are dropped
-- outright when corrupted; a corrupted name falls back to a safe generated one
-- when cleaning would violate the trim/length constraints.
update public.leagues
set description = null
where description ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]';

update public.leagues
set demo_payment_instructions = null
where demo_payment_instructions ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]';

update public.leagues
set name = case
  when char_length(
    btrim(
      regexp_replace(name, '[\x01-\x1F\x7F-\x9F]', '', 'g'),
      U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    )
  ) between 3 and 80
    then btrim(
      regexp_replace(name, '[\x01-\x1F\x7F-\x9F]', '', 'g'),
      U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    )
  else 'ליגה ' || left(id::text, 8)
end
where name ~ '[\x01-\x1F\x7F-\x9F]';

alter table public.leagues
  add constraint leagues_name_control_characters_check
    check (name !~ '[\x01-\x1F\x7F-\x9F]'),
  add constraint leagues_description_control_characters_check
    check (
      description is null
      or description !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]'
    ),
  add constraint leagues_demo_payment_instructions_control_characters_check
    check (
      demo_payment_instructions is null
      or demo_payment_instructions !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]'
    );

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_updated_at() from public, anon, authenticated;

create trigger leagues_touch_updated_at
before update on public.leagues
for each row execute function private.touch_updated_at();

create trigger league_members_touch_updated_at
before update on public.league_members
for each row execute function private.touch_updated_at();

-- Runs after the lock trigger (alphabetical order), so a rejected change never
-- reaches it and an allowed locked_at change also refreshes updated_at.
create trigger league_scoring_rules_touch_updated_at
before update on public.league_scoring_rules
for each row execute function private.touch_updated_at();

drop index public.prize_rules_league_idx;

revoke execute on function public.create_league(
  uuid, text, text, integer, text, timestamptz, boolean, smallint, smallint, smallint, jsonb
) from service_role;
