-- Slice 1 identity: private user profiles created from Supabase Auth users.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_trimmed_check
    check (display_name = btrim(display_name)),
  constraint profiles_display_name_length_check
    check (char_length(display_name) between 2 and 50)
);

comment on table public.profiles is
  'Private Slice 1 user profiles. Cross-user visibility is added only with a later league-membership model.';

alter table public.profiles enable row level security;

revoke all on table public.profiles from public, anon, authenticated;
grant select (id, display_name, created_at, updated_at)
  on table public.profiles to authenticated;
grant update (display_name)
  on table public.profiles to authenticated;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.display_name is distinct from old.display_name then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.set_profile_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_profile_updated_at();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_display_name text;
begin
  candidate_display_name := btrim(
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  );

  if char_length(candidate_display_name) not between 2 and 50 then
    candidate_display_name := btrim(
      split_part(coalesce(new.email, ''), '@', 1)
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

create trigger auth_user_created_create_profile
after insert on auth.users
for each row
execute function public.handle_new_auth_user();
