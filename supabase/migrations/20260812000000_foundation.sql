-- Slice 0 foundation: shared extensions and the provider status contract only.
-- Product tables, RLS policies, and privileged functions arrive with later slices.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  create type public.match_status as enum (
    'scheduled',
    'live',
    'finished',
    'postponed',
    'canceled'
  );
exception
  when duplicate_object then null;
end
$$;
