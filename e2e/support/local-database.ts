import { spawnSync } from "node:child_process";

const localDatabaseContainer = "supabase_db_predictor";
const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
