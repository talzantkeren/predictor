import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const expectedSlideCount = 9;
const presentationRoot = "presentation";
const deckPath = `${presentationRoot}/predictor1-final-project.pptx`;
const renderedRoot = `${presentationRoot}/predictor1-final-project`;
const fallbackRoot = `${presentationRoot}/fallback`;

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requiredFile(path, minimumBytes = 1) {
  const value = await readFile(path).catch(() => undefined);
  invariant(value, `Missing required presentation artifact: ${path}`);
  invariant(
    value.length >= minimumBytes,
    `Presentation artifact is unexpectedly small: ${path}`,
  );
  return value;
}

function readZipEntries(zip) {
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const localSignature = 0x04034b50;
  const minimumEocdOffset = Math.max(0, zip.length - 65_557);
  let eocdOffset = -1;

  for (let offset = zip.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }

  invariant(eocdOffset >= 0, "The deck is not a readable PPTX ZIP archive.");
  const totalEntries = zip.readUInt16LE(eocdOffset + 10);
  let offset = zip.readUInt32LE(eocdOffset + 16);
  const entries = new Map();

  for (let index = 0; index < totalEntries; index += 1) {
    invariant(
      zip.readUInt32LE(offset) === centralSignature,
      "The PPTX central directory is malformed.",
    );
    const compressionMethod = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const filenameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const filename = zip
      .subarray(offset + 46, offset + 46 + filenameLength)
      .toString("utf8");

    invariant(
      zip.readUInt32LE(localOffset) === localSignature,
      `The local PPTX entry is malformed: ${filename}`,
    );
    const localFilenameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localFilenameLength + localExtraLength;
    const compressed = zip.subarray(dataOffset, dataOffset + compressedSize);
    let data;
    if (compressionMethod === 0) {
      data = compressed;
    } else if (compressionMethod === 8) {
      data = inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported PPTX compression method for ${filename}.`);
    }
    entries.set(filename, data);
    offset += 46 + filenameLength + extraLength + commentLength;
  }

  return entries;
}

function pngDimensions(buffer, path) {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  invariant(
    buffer.subarray(0, pngSignature.length).equals(pngSignature),
    `Expected a PNG image: ${path}`,
  );
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  invariant(width >= 1_000 && height >= 600, `PNG is too small for fallback use: ${path}`);
  return { width, height };
}

function requireText(value, fragments, path) {
  for (const fragment of fragments) {
    invariant(value.includes(fragment), `Missing "${fragment}" in ${path}`);
  }
}

const deck = await requiredFile(deckPath, 50_000);
invariant(deck.subarray(0, 2).toString("ascii") === "PK", "The deck is not a PPTX archive.");
const entries = readZipEntries(deck);

const slideEntries = [...entries.keys()].filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name));
const notesEntries = [...entries.keys()].filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/u.test(name));
invariant(slideEntries.length === expectedSlideCount, `Expected ${expectedSlideCount} editable slides.`);
invariant(notesEntries.length === expectedSlideCount, `Expected notes on all ${expectedSlideCount} slides.`);

for (let index = 1; index <= expectedSlideCount; index += 1) {
  invariant(entries.has(`ppt/slides/slide${index}.xml`), `Missing editable slide ${index}.`);
  const notes = entries.get(`ppt/notesSlides/notesSlide${index}.xml`)?.toString("utf8") ?? "";
  requireText(notes, ["[Sources]", "[/Sources]"], `speaker notes for slide ${index}`);
}

const closingRelationships = entries
  .get("ppt/slides/_rels/slide9.xml.rels")
  ?.toString("utf8") ?? "";
requireText(
  closingRelationships,
  ["https://predictor-swart.vercel.app", "https://github.com/talzantkeren/predictor"],
  "slide 9 links",
);
invariant(
  [...entries.keys()].filter((name) => name.startsWith("ppt/media/")).length >= 2,
  "The editable deck must embed its lifecycle visuals.",
);

const renderedDimensions = new Set();
for (let index = 1; index <= expectedSlideCount; index += 1) {
  const path = `${renderedRoot}/slide-${index}.png`;
  const dimensions = pngDimensions(await requiredFile(path, 10_000), path);
  renderedDimensions.add(`${dimensions.width}x${dimensions.height}`);
}
invariant(renderedDimensions.size === 1, "Rendered slides do not share one 16:9 canvas.");

const fallbackFiles = [
  "01-open-league.png",
  "02-active-current-report.png",
  "03-completed-final-report.png",
];
for (const filename of fallbackFiles) {
  const path = `${fallbackRoot}/${filename}`;
  pngDimensions(await requiredFile(path, 10_000), path);
}

const demoScriptPath = `${presentationRoot}/demo-script.md`;
const presenterReadmePath = `${presentationRoot}/README.md`;
const rehearsalLogPath = `${presentationRoot}/rehearsal-log.md`;
const lifecycleSpecPath = "e2e/lifecycle.spec.ts";
const [demoScript, presenterReadme, rehearsalLog, lifecycleSpec] = await Promise.all([
  requiredFile(demoScriptPath, 2_000),
  requiredFile(presenterReadmePath, 1_000),
  requiredFile(rehearsalLogPath, 1_000),
  requiredFile(lifecycleSpecPath, 1_000),
]);

requireText(
  demoScript.toString("utf8"),
  [
    "10–15",
    "פתיחה",
    "הצטרפות",
    "הפעלת הליגה",
    "דירוג נוכחי",
    "השלמת הליגה",
    "דירוג סופי",
    ...fallbackFiles,
  ],
  demoScriptPath,
);
requireText(
  presenterReadme.toString("utf8"),
  [
    "https://predictor-swart.vercel.app",
    "https://github.com/talzantkeren/predictor",
    "Auth לא נתמך ולא מאומת",
    "presentation:check",
  ],
  presenterReadmePath,
);
requireText(
  rehearsalLog.toString("utf8"),
  ["OWNER_ACTION_REQUIRED", "<candidate-sha>", "10:00–15:00"],
  rehearsalLogPath,
);
requireText(
  lifecycleSpec.toString("utf8"),
  ["CAPTURE_PRESENTATION_ASSETS", ...fallbackFiles],
  lifecycleSpecPath,
);

const trackedPresentationText = Buffer.concat([demoScript, presenterReadme, rehearsalLog]).toString("utf8");
invariant(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(trackedPresentationText), "Presentation text resembles a JWT.");
invariant(
  !/(?:SUPABASE_SECRET_KEY|CRON_SECRET|SPORTS_API_KEY)\s*=\s*\S+/u.test(trackedPresentationText),
  "Presentation text contains a server-secret assignment.",
);

console.log(
  `Presentation artifacts verified: ${expectedSlideCount} editable/rendered slides, ${fallbackFiles.length} fallback images, notes, public links and presenter runbook.`,
);
