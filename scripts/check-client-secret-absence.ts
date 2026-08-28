import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { extname, join } from "node:path";

type ScanContract = {
  version: 1;
  buildId: string;
  syntheticSentinel: string;
};

const nextDirectory = join(process.cwd(), ".next");
const buildIdPath = join(nextDirectory, "BUILD_ID");
const contractPath = join(nextDirectory, "client-secret-scan-contract.json");
let buildId: string;
try {
  buildId = readFileSync(buildIdPath, "utf8").trim();
} catch {
  console.error("The client artifact scan requires a completed production build ID.");
  process.exit(1);
}
if (!buildId) {
  console.error("The client artifact scan requires a completed production build ID.");
  process.exit(1);
}

function isSyntheticSentinel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^sports-client-sentinel-[a-f0-9]{48}$/u.test(value)
  );
}

const environmentSentinel = process.env.CLIENT_SECRET_SENTINEL;
let contract: ScanContract;
try {
  contract = JSON.parse(readFileSync(contractPath, "utf8")) as ScanContract;
} catch {
  console.error(
    "The direct client artifact scan requires the synthetic sentinel contract produced by test:client-secrets.",
  );
  process.exit(1);
}

if (
  contract.version !== 1 ||
  contract.buildId !== buildId ||
  !isSyntheticSentinel(contract.syntheticSentinel)
) {
  console.error(
    "The synthetic sentinel contract does not belong to the current production build.",
  );
  process.exit(1);
}
if (environmentSentinel && environmentSentinel !== contract.syntheticSentinel) {
  console.error(
    "The supplied synthetic sentinel does not match the current production build contract.",
  );
  process.exit(1);
}
const requiredSentinel = contract.syntheticSentinel;

const roots = [
  { directory: join(nextDirectory, "static"), allFiles: true },
  { directory: join(nextDirectory, "server", "app"), allFiles: false },
];
const renderedExtensions = new Set([".html", ".rsc", ".txt"]);
let filesScanned = 0;

function scan(directory: string, allFiles: boolean) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      scan(path, allFiles);
      continue;
    }
    if (!allFiles && !renderedExtensions.has(extname(path))) continue;

    filesScanned += 1;
    if (readFileSync(path).includes(Buffer.from(requiredSentinel))) {
      console.error("A server-only sentinel was found in a client or rendered artifact.");
      process.exit(1);
    }
  }
}

for (const root of roots) scan(root.directory, root.allFiles);
if (filesScanned === 0) {
  console.error("The client artifact scan did not inspect any build output.");
  process.exit(1);
}

console.log(`Client secret scan passed across ${filesScanned} build artifacts.`);
