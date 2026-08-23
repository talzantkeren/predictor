import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const sentinel = process.env.CLIENT_SECRET_SENTINEL;
if (!sentinel) {
  console.error("CLIENT_SECRET_SENTINEL is required for the client artifact scan.");
  process.exit(1);
}
const requiredSentinel = sentinel;

const roots = [
  { directory: join(process.cwd(), ".next", "static"), allFiles: true },
  { directory: join(process.cwd(), ".next", "server", "app"), allFiles: false },
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
