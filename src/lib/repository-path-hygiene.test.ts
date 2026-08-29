import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const boundary = String.raw`(?:^|[\s"'\x60=(:])`;
const unixHomeNames = ["Users", "home", "root", "workspace", "workspaces"];
const windowsHomeNames = ["Users", "Documents and Settings"];
const unixTail = String.raw`[^\s"'\x60<>]+`;
const windowsSeparator = String.raw`[\\/]`;

const developerPathPatterns = [
  new RegExp(
    `${boundary}/(?:${unixHomeNames.join("|")})/${unixTail}`,
    "u",
  ),
  new RegExp(
    `${boundary}/mnt/[a-z]/(?:${windowsHomeNames.join("|")})/${unixTail}`,
    "u",
  ),
  new RegExp(
    `${boundary}[A-Za-z]:${windowsSeparator}(?:${windowsHomeNames.join("|")})${windowsSeparator}${unixTail}`,
    "u",
  ),
];

function containsDeveloperPath(value: string) {
  return developerPathPatterns.some((pattern) => pattern.test(value));
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

describe("repository path hygiene", () => {
  it.each([
    ["macOS", ["", "Users", "developer", "project", "file.txt"].join("/")],
    ["Linux", ["", "home", "developer", "project", "file.txt"].join("/")],
    ["root", ["", "root", "project", "file.txt"].join("/")],
    [
      "Windows",
      ["C:", "Users", "developer", "project", "file.txt"].join("\\"),
    ],
    [
      "WSL",
      ["", "mnt", "c", "Users", "developer", "project", "file.txt"].join(
        "/",
      ),
    ],
  ])("recognizes a %s developer path", (_label, developerPath) => {
    expect(containsDeveloperPath(developerPath)).toBe(true);
  });

  it("keeps absolute developer paths out of tracked text files", () => {
    const findings: string[] = [];

    for (const repositoryPath of trackedFiles()) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(resolve(repositoryRoot, repositoryPath));
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? error.code
            : undefined;
        if (code === "ENOENT") continue;
        throw error;
      }

      if (bytes.includes(0)) continue;
      const lines = bytes.toString("utf8").split(/\r?\n/u);
      for (const [index, line] of lines.entries()) {
        if (containsDeveloperPath(line)) {
          findings.push(`${repositoryPath}:${index + 1}`);
        }
      }
    }

    expect(
      findings,
      `Tracked text contains absolute developer paths:\n${findings.join("\n")}`,
    ).toEqual([]);
  });
});
