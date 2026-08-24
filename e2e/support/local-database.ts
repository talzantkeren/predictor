import { spawnSync } from "node:child_process";

const localDatabaseContainer = "supabase_db_predictor";
const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function assertCanonicalUuid(value: string, label: string) {
  if (!canonicalUuidPattern.test(value)) {
    throw new Error(`Local ${label} fixture ID was malformed.`);
  }
}

function assertDisposableLocalDatabaseIsRunning() {
  const inspection = spawnSync(
    "docker",
    ["inspect", "--format", "{{.State.Running}}", localDatabaseContainer],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );

  if (inspection.status !== 0 || inspection.stdout.trim() !== "true") {
    throw new Error("Disposable local Supabase database is unavailable.");
  }
}

export function expireInviteInDisposableLocalDatabase(publicId: string) {
  if (!canonicalUuidPattern.test(publicId)) {
    throw new Error("Local expiry fixture ID was malformed.");
  }

  assertDisposableLocalDatabaseIsRunning();

  const fixture = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `with fixture as (select clock_timestamp() - interval '2 days' as created_at) update public.invite_links as invite set created_at = fixture.created_at, expires_at = fixture.created_at + interval '1 day' from fixture where invite.public_id = '${publicId}'::uuid;`,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );

  if (fixture.status !== 0 || fixture.stdout.trim() !== "UPDATE 1") {
    // Never include PostgreSQL stderr here: a constraint error can contain a
    // complete invite row, including its stored token digest.
    throw new Error("Local expired-invite fixture could not be created.");
  }
}

export function removeInviteFromDisposableLocalDatabase(publicId: string) {
  if (!canonicalUuidPattern.test(publicId)) {
    throw new Error("Local invite cleanup ID was malformed.");
  }

  assertDisposableLocalDatabaseIsRunning();

  const cleanup = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `delete from public.invite_links where public_id = '${publicId}'::uuid;`,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );

  if (cleanup.status !== 0 || cleanup.stdout.trim() !== "DELETE 1") {
    // Preserve the primary assertion error and never include PostgreSQL stderr,
    // which could contain the stored invite digest.
    throw new Error("Local expired-invite fixture could not be removed.");
  }
}

export function addActiveLeagueMemberInDisposableLocalDatabase({
  leagueId,
  userId,
  approvedBy,
}: {
  leagueId: string;
  userId: string;
  approvedBy: string;
}) {
  assertCanonicalUuid(leagueId, "league");
  assertCanonicalUuid(userId, "member");
  assertCanonicalUuid(approvedBy, "approver");
  assertDisposableLocalDatabaseIsRunning();

  const fixture = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `insert into public.league_members (league_id, user_id, status, approved_by, approved_at) values ('${leagueId}'::uuid, '${userId}'::uuid, 'active', '${approvedBy}'::uuid, clock_timestamp()) on conflict (league_id, user_id) do update set status = 'active', approved_by = excluded.approved_by, approved_at = excluded.approved_at, removed_by = null, removed_at = null;`,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  if (fixture.status !== 0 || fixture.stdout.trim() !== "INSERT 0 1") {
    throw new Error("Local active-member fixture could not be created.");
  }
}

export function addPendingJoinRequestInDisposableLocalDatabase({
  leagueId,
  userId,
}: {
  leagueId: string;
  userId: string;
}) {
  assertCanonicalUuid(leagueId, "league");
  assertCanonicalUuid(userId, "requester");
  assertDisposableLocalDatabaseIsRunning();

  const fixture = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `insert into public.join_requests (league_id, user_id, status) values ('${leagueId}'::uuid, '${userId}'::uuid, 'pending_proof');`,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  if (fixture.status !== 0 || fixture.stdout.trim() !== "INSERT 0 1") {
    throw new Error("Local pending-request fixture could not be created.");
  }
}

export type PredictionMatchFixtureIds = {
  homeTeamId: string;
  awayTeamId: string;
  openMatchId: string;
  staleCreationMatchId: string;
  postponedMatchId: string;
  canceledMatchId: string;
  liveMatchId: string;
  finishedMatchId: string;
};

export function seedPredictionMatchesInDisposableLocalDatabase(
  ids: PredictionMatchFixtureIds,
) {
  for (const [label, value] of Object.entries(ids)) {
    assertCanonicalUuid(value, label);
  }
  assertDisposableLocalDatabaseIsRunning();

  const homeSuffix = ids.homeTeamId.slice(0, 8);
  const awaySuffix = ids.awayTeamId.slice(0, 8);
  const fixture = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `insert into public.teams (id, name, short_name) values ('${ids.homeTeamId}'::uuid, 'קבוצת E2E בית ${homeSuffix}', 'בית ${homeSuffix}'), ('${ids.awayTeamId}'::uuid, 'קבוצת E2E חוץ ${awaySuffix}', 'חוץ ${awaySuffix}'); with fixture as (select clock_timestamp() as fixture_now) insert into public.matches (id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status, home_score, away_score) select match.id, '26000000-0000-4000-8000-000000000027'::uuid, match.round_number, match.home_team_id, match.away_team_id, fixture.fixture_now + match.kickoff_offset, match.status::public.match_status, match.home_score, match.away_score from fixture cross join (values ('${ids.openMatchId}'::uuid, 95::smallint, '${ids.homeTeamId}'::uuid, '${ids.awayTeamId}'::uuid, interval '1 day', 'scheduled', null::smallint, null::smallint), ('${ids.staleCreationMatchId}'::uuid, 95::smallint, '${ids.awayTeamId}'::uuid, '${ids.homeTeamId}'::uuid, interval '2 days', 'scheduled', null::smallint, null::smallint), ('${ids.postponedMatchId}'::uuid, 96::smallint, '${ids.homeTeamId}'::uuid, '${ids.awayTeamId}'::uuid, interval '3 days', 'postponed', null::smallint, null::smallint), ('${ids.canceledMatchId}'::uuid, 96::smallint, '${ids.awayTeamId}'::uuid, '${ids.homeTeamId}'::uuid, interval '4 days', 'canceled', null::smallint, null::smallint), ('${ids.liveMatchId}'::uuid, 94::smallint, '${ids.awayTeamId}'::uuid, '${ids.homeTeamId}'::uuid, interval '-30 minutes', 'live', null::smallint, null::smallint), ('${ids.finishedMatchId}'::uuid, 94::smallint, '${ids.homeTeamId}'::uuid, '${ids.awayTeamId}'::uuid, interval '-1 day', 'finished', 2::smallint, 1::smallint)) as match(id, round_number, home_team_id, away_team_id, kickoff_offset, status, home_score, away_score);`,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  const output = fixture.stdout.trim().split(/\r?\n/);
  if (
    fixture.status !== 0 ||
    output.length !== 2 ||
    output[0] !== "INSERT 0 2" ||
    output[1] !== "INSERT 0 6"
  ) {
    throw new Error("Local prediction-match fixtures could not be created.");
  }

  return {
    homeTeamName: `קבוצת E2E בית ${homeSuffix}`,
    awayTeamName: `קבוצת E2E חוץ ${awaySuffix}`,
  };
}

export function moveMatchKickoffToPastInDisposableLocalDatabase(matchId: string) {
  assertCanonicalUuid(matchId, "match");
  assertDisposableLocalDatabaseIsRunning();

  const fixture = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `update public.matches set kickoff_at = clock_timestamp() - interval '1 minute' where id = '${matchId}'::uuid;`,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  if (fixture.status !== 0 || fixture.stdout.trim() !== "UPDATE 1") {
    throw new Error("Local match-lock fixture could not be moved.");
  }
}

export function removePredictionMatchesFromDisposableLocalDatabase(
  ids: PredictionMatchFixtureIds,
) {
  for (const [label, value] of Object.entries(ids)) {
    assertCanonicalUuid(value, label);
  }
  assertDisposableLocalDatabaseIsRunning();

  const matchIds = [
    ids.openMatchId,
    ids.staleCreationMatchId,
    ids.postponedMatchId,
    ids.canceledMatchId,
    ids.liveMatchId,
    ids.finishedMatchId,
  ];
  const sqlMatchIds = matchIds.map((id) => `'${id}'::uuid`).join(", ");
  const cleanup = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `begin; delete from public.predictions where match_id in (${sqlMatchIds}); delete from public.matches where id in (${sqlMatchIds}); delete from public.teams where id in ('${ids.homeTeamId}'::uuid, '${ids.awayTeamId}'::uuid); commit;`,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  const output = cleanup.stdout.trim().split(/\r?\n/);
  const predictionDelete = output[1]?.match(/^DELETE ([0-9]+)$/);
  const matchDelete = output[2]?.match(/^DELETE ([0-9]+)$/);
  const teamDelete = output[3]?.match(/^DELETE ([0-9]+)$/);
  if (
    cleanup.status !== 0 ||
    output[0] !== "BEGIN" ||
    !predictionDelete ||
    !matchDelete ||
    !teamDelete ||
    ![0, 6].includes(Number(matchDelete[1])) ||
    ![0, 2].includes(Number(teamDelete[1])) ||
    output[4] !== "COMMIT"
  ) {
    throw new Error("Local prediction-match fixtures could not be removed safely.");
  }
}

export type ScoringMatchFixtureIds = {
  homeTeamId: string;
  awayTeamId: string;
  matchId: string;
};

export function grantSystemAdminInDisposableLocalDatabase(userId: string) {
  assertCanonicalUuid(userId, "system administrator");
  assertDisposableLocalDatabaseIsRunning();

  const fixture = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `insert into public.system_admins (user_id, granted_by) values ('${userId}'::uuid, '${userId}'::uuid) on conflict (user_id) do nothing;`,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  if (fixture.status !== 0 || fixture.stdout.trim() !== "INSERT 0 1") {
    throw new Error("Local system-administrator fixture could not be created.");
  }
}

export function countSyncRunsInDisposableLocalDatabase() {
  assertDisposableLocalDatabaseIsRunning();

  const result = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      "select count(*)::integer from public.sync_runs;",
    ],
    { encoding: "utf8", windowsHide: true },
  );

  const count = Number(result.stdout.trim());
  if (
    result.status !== 0 ||
    !Number.isSafeInteger(count) ||
    count < 0
  ) {
    throw new Error("Local sync-run count could not be read.");
  }

  return count;
}

export function removeSyncFixturesFromDisposableLocalDatabase({
  runIds,
  systemAdminUserId,
}: {
  runIds: string[];
  systemAdminUserId: string;
}) {
  if (runIds.length < 1 || runIds.length > 10) {
    throw new Error("Local sync cleanup requires one to ten run IDs.");
  }
  for (const runId of runIds) assertCanonicalUuid(runId, "sync run");
  assertCanonicalUuid(systemAdminUserId, "system administrator");
  assertDisposableLocalDatabaseIsRunning();
  const sqlRunIds = runIds.map((runId) => `'${runId}'::uuid`).join(",");

  const cleanup = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `begin; delete from public.sync_runs where id in (${sqlRunIds}); delete from public.system_admins where user_id = '${systemAdminUserId}'::uuid; commit;`,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  const output = cleanup.stdout.trim().split(/\r?\n/);
  if (
    cleanup.status !== 0 ||
    output[0] !== "BEGIN" ||
    output[1] !== `DELETE ${runIds.length}` ||
    output[2] !== "DELETE 1" ||
    output[3] !== "COMMIT"
  ) {
    throw new Error("Local sync fixtures could not be removed safely.");
  }
}

export function seedSyncObservabilityRunsInDisposableLocalDatabase(
  runIds: { succeeded: string; failed: string; concurrent: string },
) {
  for (const [label, value] of Object.entries(runIds)) {
    assertCanonicalUuid(value, `sync ${label} run`);
  }
  assertDisposableLocalDatabaseIsRunning();

  const fixture = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `insert into public.sync_runs (id, provider, status, sync_kind, started_at, finished_at, fixtures_seen, rows_inserted, teams_changed, matches_changed, results_changed, manual_overrides_skipped, quota_remaining, operator_notes, error_code, error_message_safe) values ('${runIds.succeeded}'::uuid, 'api-football', 'succeeded', 'catalog', statement_timestamp(), statement_timestamp(), 182, 198, 14, 182, 1, 0, 7421, array[]::text[], null, null), ('${runIds.failed}'::uuid, 'api-football', 'failed', 'targeted', statement_timestamp(), statement_timestamp(), 0, 0, 0, 0, 0, 0, null, array[]::text[], 'PROVIDER_TIMEOUT', 'The sports provider request timed out.'), ('${runIds.concurrent}'::uuid, 'api-football', 'skipped', 'targeted', statement_timestamp(), statement_timestamp(), 0, 0, 0, 0, 0, 0, null, array[]::text[], 'CONCURRENT_ATTEMPT', null);`,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  if (fixture.status !== 0 || fixture.stdout.trim() !== "INSERT 0 3") {
    throw new Error("Local Sync observability fixtures could not be created.");
  }
}

export type ProviderPredictionLockFixtureIds = {
  competitionId: string;
  seasonId: string;
  homeTeamId: string;
  awayTeamId: string;
  matchId: string;
  leagueId: string;
};

export function seedProviderPredictionLockFixtureInDisposableLocalDatabase(
  ids: ProviderPredictionLockFixtureIds,
  memberUserId: string,
) {
  for (const [label, value] of Object.entries(ids)) {
    assertCanonicalUuid(value, `provider fixture ${label}`);
  }
  assertCanonicalUuid(memberUserId, "provider fixture member");
  assertDisposableLocalDatabaseIsRunning();
  const externalSuffix = ids.matchId.replaceAll("-", "");

  const fixture = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `begin; insert into public.competitions (id, name, slug, country_code, external_provider, external_id) values ('${ids.competitionId}'::uuid, 'ליגת ספק E2E', 'api-football-e2e-${ids.competitionId}', 'IL', 'api-football', '${externalSuffix}1'); insert into public.seasons (id, competition_id, name, starts_on, ends_on, is_current, external_provider, external_id) values ('${ids.seasonId}'::uuid, '${ids.competitionId}'::uuid, '2026/27 E2E', '2026-08-22', '2027-05-31', true, 'api-football', '${externalSuffix}2'); insert into public.teams (id, name, short_name, external_provider, external_id) values ('${ids.homeTeamId}'::uuid, 'קבוצת ספק בית', 'ספק בית', 'api-football', '${externalSuffix}3'), ('${ids.awayTeamId}'::uuid, 'קבוצת ספק חוץ', 'ספק חוץ', 'api-football', '${externalSuffix}4'); insert into public.matches (id, season_id, round_number, provider_round_label, provider_status, home_team_id, away_team_id, kickoff_at, status, predictions_locked_at, external_provider, external_id) values ('${ids.matchId}'::uuid, '${ids.seasonId}'::uuid, 26, 'Regular Season - 26', 'AET', '${ids.homeTeamId}'::uuid, '${ids.awayTeamId}'::uuid, clock_timestamp() + interval '2 days', 'postponed', clock_timestamp(), 'api-football', '${externalSuffix}5'); insert into public.leagues (id, manager_id, season_id, name, status) values ('${ids.leagueId}'::uuid, '${memberUserId}'::uuid, '${ids.seasonId}'::uuid, 'ליגת בדיקת ספק', 'active'); insert into public.league_scoring_rules (league_id) values ('${ids.leagueId}'::uuid); insert into public.league_members (league_id, user_id, approved_by) values ('${ids.leagueId}'::uuid, '${memberUserId}'::uuid, '${memberUserId}'::uuid); commit;`,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  const output = fixture.stdout.trim().split(/\r?\n/);
  if (
    fixture.status !== 0 ||
    output[0] !== "BEGIN" ||
    output.at(-1) !== "COMMIT"
  ) {
    throw new Error("Local provider prediction-lock fixture could not be created.");
  }
}

export function removeProviderPredictionLockFixtureFromDisposableLocalDatabase(
  ids: ProviderPredictionLockFixtureIds,
) {
  for (const [label, value] of Object.entries(ids)) {
    assertCanonicalUuid(value, `provider cleanup ${label}`);
  }
  assertDisposableLocalDatabaseIsRunning();

  const cleanup = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `begin; delete from public.leagues where id = '${ids.leagueId}'::uuid; delete from public.matches where id = '${ids.matchId}'::uuid; delete from public.seasons where id = '${ids.seasonId}'::uuid; delete from public.competitions where id = '${ids.competitionId}'::uuid; delete from public.teams where id in ('${ids.homeTeamId}'::uuid, '${ids.awayTeamId}'::uuid); commit;`,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  const output = cleanup.stdout.trim().split(/\r?\n/);
  if (
    cleanup.status !== 0 ||
    output[0] !== "BEGIN" ||
    output[1] !== "DELETE 1" ||
    output[2] !== "DELETE 1" ||
    output[3] !== "DELETE 1" ||
    output[4] !== "DELETE 1" ||
    output[5] !== "DELETE 2" ||
    output[6] !== "COMMIT"
  ) {
    throw new Error("Local provider prediction-lock fixture could not be removed.");
  }
}

export function seedScoringMatchInDisposableLocalDatabase(
  ids: ScoringMatchFixtureIds,
) {
  for (const [label, value] of Object.entries(ids)) {
    assertCanonicalUuid(value, label);
  }
  assertDisposableLocalDatabaseIsRunning();

  const suffix = ids.matchId.slice(0, 8);
  const homeTeamName = `קבוצת ניקוד בית ${suffix}`;
  const awayTeamName = `קבוצת ניקוד חוץ ${suffix}`;
  const fixture = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `insert into public.teams (id, name, short_name) values ('${ids.homeTeamId}'::uuid, '${homeTeamName}', 'בית ${suffix}'), ('${ids.awayTeamId}'::uuid, '${awayTeamName}', 'חוץ ${suffix}'); insert into public.matches (id, season_id, round_number, home_team_id, away_team_id, kickoff_at, status) values ('${ids.matchId}'::uuid, '26000000-0000-4000-8000-000000000027'::uuid, 98, '${ids.homeTeamId}'::uuid, '${ids.awayTeamId}'::uuid, clock_timestamp() + interval '1 day', 'scheduled');`,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  const output = fixture.stdout.trim().split(/\r?\n/);
  if (
    fixture.status !== 0 ||
    output.length !== 2 ||
    output[0] !== "INSERT 0 2" ||
    output[1] !== "INSERT 0 1"
  ) {
    throw new Error("Local scoring-match fixture could not be created.");
  }

  return { homeTeamName, awayTeamName };
}

export function removeScoringFixturesFromDisposableLocalDatabase({
  ids,
  systemAdminUserId,
}: {
  ids: ScoringMatchFixtureIds;
  systemAdminUserId: string;
}) {
  for (const [label, value] of Object.entries(ids)) {
    assertCanonicalUuid(value, label);
  }
  assertCanonicalUuid(systemAdminUserId, "system administrator");
  assertDisposableLocalDatabaseIsRunning();

  const cleanup = spawnSync(
    "docker",
    [
      "exec",
      localDatabaseContainer,
      "psql",
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--username=postgres",
      "--dbname=postgres",
      "--command",
      `begin; delete from public.audit_logs where entity_type = 'match_result' and entity_id = '${ids.matchId}'::uuid; delete from public.predictions where match_id = '${ids.matchId}'::uuid; delete from public.system_admins where user_id = '${systemAdminUserId}'::uuid; delete from public.matches where id = '${ids.matchId}'::uuid; delete from public.teams where id in ('${ids.homeTeamId}'::uuid, '${ids.awayTeamId}'::uuid); commit;`,
    ],
    { encoding: "utf8", windowsHide: true },
  );

  const output = cleanup.stdout.trim().split(/\r?\n/);
  const matchDelete = output[4]?.match(/^DELETE ([0-9]+)$/);
  const teamDelete = output[5]?.match(/^DELETE ([0-9]+)$/);
  if (
    cleanup.status !== 0 ||
    output[0] !== "BEGIN" ||
    !matchDelete ||
    Number(matchDelete[1]) !== 1 ||
    !teamDelete ||
    Number(teamDelete[1]) !== 2 ||
    output[6] !== "COMMIT"
  ) {
    throw new Error("Local scoring fixtures could not be removed safely.");
  }
}
