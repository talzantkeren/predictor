begin;

select no_plan();

select is(
  (
    select count(*)::integer
    from pg_constraint
    where contype = 'c'
      and convalidated
      and conname in (
        'profiles_display_name_bidi_controls_check',
        'leagues_name_bidi_controls_check',
        'leagues_description_bidi_controls_check',
        'leagues_demo_instructions_bidi_controls_check',
        'join_requests_rejection_reason_bidi_controls_check',
        'competitions_name_bidi_controls_check',
        'seasons_name_bidi_controls_check',
        'teams_name_bidi_controls_check',
        'teams_short_name_bidi_controls_check',
        'sports_provider_rounds_label_bidi_controls_check',
        'matches_provider_round_label_bidi_controls_check'
      )
  ),
  11,
  'all user and provider display-text bidi constraints are validated'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '81500000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'bidi-manager@example.com',
    extensions.crypt('not-a-real-password', extensions.gen_salt('bf')),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Tal כהן 2026"}', clock_timestamp(), clock_timestamp()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '81500000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'bidi-member@example.com',
    extensions.crypt('not-a-real-password', extensions.gen_salt('bf')),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Noa לוי Academy"}', clock_timestamp(), clock_timestamp()
  );

insert into public.competitions (id, name, slug, country_code)
values (
  '81500000-0000-4000-8000-000000000010',
  'תחרות Predictor 2026', 'slice9-bidi', 'IL'
);

insert into public.seasons (
  id, competition_id, name, starts_on, ends_on, is_current
) values (
  '81500000-0000-4000-8000-000000000011',
  '81500000-0000-4000-8000-000000000010',
  'עונת 2026/27 Academy', '2026-08-01', '2027-06-30', false
);

insert into public.teams (id, name, short_name) values
  (
    '81500000-0000-4000-8000-000000000012',
    'Maccabi תל אביב Academy', 'MTA נוער'
  ),
  (
    '81500000-0000-4000-8000-000000000013',
    'Hapoel באר שבע U19', 'HBS נוער'
  );

insert into public.matches (
  id, season_id, round_number, provider_round_label,
  home_team_id, away_team_id, kickoff_at, status
) values (
  '81500000-0000-4000-8000-000000000014',
  '81500000-0000-4000-8000-000000000011',
  1, 'שלב Playoff - 1',
  '81500000-0000-4000-8000-000000000012',
  '81500000-0000-4000-8000-000000000013',
  clock_timestamp() + interval '30 days', 'scheduled'
);

insert into public.sports_provider_rounds (
  id, season_id, provider, provider_label, round_number, requires_review
) values (
  '81500000-0000-4000-8000-000000000015',
  '81500000-0000-4000-8000-000000000011',
  'api-football', 'שלב Playoff', null, true
);

insert into public.leagues (
  id, manager_id, season_id, name, description,
  demo_payment_instructions, status
) values (
  '81500000-0000-4000-8000-000000000016',
  '81500000-0000-4000-8000-000000000001',
  '81500000-0000-4000-8000-000000000011',
  'ליגת Predictor FC 2026', 'Demo league תיאור',
  'Demo instructions הוראות', 'open'
);

insert into public.join_requests (
  id, league_id, user_id, status, rejection_reason, decided_by, decided_at
) values (
  '81500000-0000-4000-8000-000000000017',
  '81500000-0000-4000-8000-000000000016',
  '81500000-0000-4000-8000-000000000002',
  'rejected', 'Demo reason סיבה',
  '81500000-0000-4000-8000-000000000001', clock_timestamp()
);

select ok(
  (select display_name = 'Tal כהן 2026' from public.profiles where id = '81500000-0000-4000-8000-000000000001')
  and (select name = 'ליגת Predictor FC 2026' from public.leagues where id = '81500000-0000-4000-8000-000000000016')
  and (select name = 'תחרות Predictor 2026' from public.competitions where id = '81500000-0000-4000-8000-000000000010')
  and (select name = 'Maccabi תל אביב Academy' from public.teams where id = '81500000-0000-4000-8000-000000000012')
  and (select provider_round_label = 'שלב Playoff - 1' from public.matches where id = '81500000-0000-4000-8000-000000000014'),
  'legitimate long mixed Hebrew and Latin display text is preserved'
);

select throws_ok(
  $sql$update public.profiles set display_name = U&'Tal \202Aspoof' where id = '81500000-0000-4000-8000-000000000001'$sql$,
  '23514', null, 'LRE is rejected in a profile display name'
);
select throws_ok(
  $sql$update public.profiles set display_name = U&'Tal \202Espoof' where id = '81500000-0000-4000-8000-000000000001'$sql$,
  '23514', null, 'RLO is rejected in a profile display name'
);
select throws_ok(
  $sql$update public.profiles set display_name = U&'Tal \2067spoof' where id = '81500000-0000-4000-8000-000000000001'$sql$,
  '23514', null, 'RLI is rejected in a profile display name'
);
select throws_ok(
  $sql$update public.profiles set display_name = U&'Tal \2069spoof' where id = '81500000-0000-4000-8000-000000000001'$sql$,
  '23514', null, 'PDI is rejected in a profile display name'
);

select throws_ok(
  $sql$update public.leagues set name = U&'League \202Espoof' where id = '81500000-0000-4000-8000-000000000016'$sql$,
  '23514', null, 'league name rejects a bidi override'
);
select throws_ok(
  $sql$update public.leagues set description = U&'Description \2067spoof' where id = '81500000-0000-4000-8000-000000000016'$sql$,
  '23514', null, 'league description rejects a bidi isolate'
);
select throws_ok(
  $sql$update public.leagues set demo_payment_instructions = U&'Instructions \202Aspoof' where id = '81500000-0000-4000-8000-000000000016'$sql$,
  '23514', null, 'Demo instructions reject a bidi embedding'
);
select throws_ok(
  $sql$update public.join_requests set rejection_reason = U&'Reason \2069spoof' where id = '81500000-0000-4000-8000-000000000017'$sql$,
  '23514', null, 'rejection reason rejects a bidi pop isolate'
);
select throws_ok(
  $sql$update public.competitions set name = U&'Competition \202Espoof' where id = '81500000-0000-4000-8000-000000000010'$sql$,
  '23514', null, 'competition name rejects a bidi override'
);
select throws_ok(
  $sql$update public.seasons set name = U&'Season \202Aspoof' where id = '81500000-0000-4000-8000-000000000011'$sql$,
  '23514', null, 'season name rejects a bidi embedding'
);
select throws_ok(
  $sql$update public.teams set name = U&'Team \2067spoof' where id = '81500000-0000-4000-8000-000000000012'$sql$,
  '23514', null, 'team name rejects a bidi isolate'
);
select throws_ok(
  $sql$update public.teams set short_name = U&'Team \2069spoof' where id = '81500000-0000-4000-8000-000000000012'$sql$,
  '23514', null, 'team short name rejects a bidi pop isolate'
);
select throws_ok(
  $sql$update public.sports_provider_rounds set provider_label = U&'Round \202Espoof' where id = '81500000-0000-4000-8000-000000000015'$sql$,
  '23514', null, 'provider round catalog rejects a bidi override'
);
select throws_ok(
  $sql$update public.matches set provider_round_label = U&'Round \202Espoof' where id = '81500000-0000-4000-8000-000000000014'$sql$,
  '23514', null, 'match provider round label rejects a bidi override'
);

select * from finish();
rollback;
