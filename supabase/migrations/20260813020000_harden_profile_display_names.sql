-- Keep database display-name normalization aligned with JavaScript String.trim().

update public.profiles
set display_name = case
  when char_length(
    btrim(
      display_name,
      U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    )
  ) between 2 and 50
    then btrim(
      display_name,
      U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    )
  else 'משתמש ' || left(id::text, 8)
end
where display_name is distinct from btrim(
  display_name,
  U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
);

alter table public.profiles
  drop constraint profiles_display_name_trimmed_check;

alter table public.profiles
  add constraint profiles_display_name_trimmed_check
  check (
    display_name = btrim(
      display_name,
      U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    )
  );

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_display_name text;
  trim_characters constant text := U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  candidate_display_name := case
    when jsonb_typeof(new.raw_user_meta_data -> 'display_name') = 'string'
      then btrim(new.raw_user_meta_data ->> 'display_name', trim_characters)
    else ''
  end;

  if char_length(candidate_display_name) not between 2 and 50 then
    candidate_display_name := btrim(
      split_part(coalesce(new.email, ''), '@', 1),
      trim_characters
    );
  end if;

  if char_length(candidate_display_name) not between 2 and 50 then
    candidate_display_name := 'משתמש ' || left(new.id::text, 8);
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, candidate_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
