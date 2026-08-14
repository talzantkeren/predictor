-- Versioned reference data required in every environment for Slice 2 league creation.
-- These are catalog records only: no provider IDs, teams, fixtures, scores, or live data.

insert into public.competitions (id, name, slug, country_code)
values (
  '26000000-0000-4000-8000-000000000001',
  'ליגת העל הישראלית',
  'israeli-premier-league',
  'IL'
)
on conflict (id) do nothing;

insert into public.seasons (
  id,
  competition_id,
  name,
  starts_on,
  ends_on,
  is_current
)
values (
  '26000000-0000-4000-8000-000000000027',
  '26000000-0000-4000-8000-000000000001',
  '2026/27',
  '2026-07-01',
  '2027-06-30',
  true
)
on conflict (id) do nothing;
