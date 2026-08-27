-- S9-DEF-015: reject invisible Unicode bidi controls at the database boundary.
-- Mixed Hebrew/Arabic/Latin text remains valid. Existing unsafe data is not
-- rewritten silently: adding validated constraints fails closed if it exists.

alter table public.profiles
  add constraint profiles_display_name_bidi_controls_check
    check (display_name !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]');

alter table public.leagues
  add constraint leagues_name_bidi_controls_check
    check (name !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]'),
  add constraint leagues_description_bidi_controls_check
    check (
      description is null
      or description !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]'
    ),
  add constraint leagues_demo_instructions_bidi_controls_check
    check (
      demo_payment_instructions is null
      or demo_payment_instructions !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]'
    );

alter table public.join_requests
  add constraint join_requests_rejection_reason_bidi_controls_check
    check (
      rejection_reason is null
      or rejection_reason !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]'
    );

alter table public.competitions
  add constraint competitions_name_bidi_controls_check
    check (name !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]');

alter table public.seasons
  add constraint seasons_name_bidi_controls_check
    check (name !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]');

alter table public.teams
  add constraint teams_name_bidi_controls_check
    check (name !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]'),
  add constraint teams_short_name_bidi_controls_check
    check (
      short_name is null
      or short_name !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]'
    );

alter table public.sports_provider_rounds
  add constraint sports_provider_rounds_label_bidi_controls_check
    check (provider_label !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]');

alter table public.matches
  add constraint matches_provider_round_label_bidi_controls_check
    check (
      provider_round_label is null
      or provider_round_label !~ U&'[\061C\200E\200F\202A-\202E\2066-\2069]'
    );

comment on constraint profiles_display_name_bidi_controls_check on public.profiles is
  'Rejects invisible Unicode bidi formatting controls while allowing ordinary mixed-script names.';
comment on constraint leagues_name_bidi_controls_check on public.leagues is
  'Rejects invisible Unicode bidi formatting controls in league names.';
comment on constraint sports_provider_rounds_label_bidi_controls_check on public.sports_provider_rounds is
  'Rejects invisible Unicode bidi formatting controls in provider round labels.';
comment on constraint matches_provider_round_label_bidi_controls_check on public.matches is
  'Rejects invisible Unicode bidi formatting controls in persisted match round labels.';
