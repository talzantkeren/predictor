import { readFile, readdir } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const minimumSlideCount = 10;
const maximumSlideCount = 14;
const expectedSlideCount = 13;
const presentationRoot = "presentation";
const deckPath = `${presentationRoot}/predictor1-final-project.pptx`;
const renderedRoot = `${presentationRoot}/predictor1-final-project`;
const fallbackRoot = `${presentationRoot}/fallback`;
const deckSourcePath = `${presentationRoot}/deck-source.md`;
const timingGuidePath = `${presentationRoot}/timing-guide.md`;
const evaluatorChecklistPath = `${presentationRoot}/evaluator-checklist.md`;

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

function decodeXmlEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    )
    .replace(/&#([0-9]+);/gu, (_, codePoint) =>
      String.fromCodePoint(Number.parseInt(codePoint, 10)),
    )
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function drawingText(xml) {
  return [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gu)]
    .map((match) => decodeXmlEntities(match[1].replace(/<[^>]+>/gu, "")))
    .join("");
}

function hasXmlAttribute(tag, name, value) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(
    `(?:^|\\s)${escapedName}\\s*=\\s*(?:"${escapedValue}"|'${escapedValue}')`,
    "u",
  ).test(tag);
}

function inspectHebrewParagraphs(xml, path, { visible }) {
  const hebrewPattern = /[\u0590-\u05ff]/u;
  const asciiLatinPattern = /[A-Za-z]/u;
  let count = 0;

  for (const paragraphMatch of xml.matchAll(
    /<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/gu,
  )) {
    const paragraph = paragraphMatch[0];
    const paragraphText = drawingText(paragraph);
    if (!hebrewPattern.test(paragraphText)) {
      continue;
    }

    count += 1;
    const paragraphProperties = paragraph.match(/<a:pPr\b[^>]*>/u)?.[0];
    invariant(
      paragraphProperties,
      `Hebrew paragraph ${count} lacks a:pPr in ${path}.`,
    );
    invariant(
      hasXmlAttribute(paragraphProperties, "rtl", "1"),
      `Hebrew paragraph ${count} lacks rtl="1" in ${path}.`,
    );
    invariant(
      hasXmlAttribute(paragraphProperties, "algn", "r"),
      `Hebrew paragraph ${count} lacks algn="r" in ${path}.`,
    );

    const defaultRunProperties = paragraph.match(/<a:defRPr\b[^>]*>/u)?.[0];
    invariant(
      defaultRunProperties && hasXmlAttribute(defaultRunProperties, "lang", "he-IL"),
      `Hebrew paragraph ${count} lacks a:defRPr lang="he-IL" in ${path}.`,
    );

    let runIndex = 0;
    for (const runMatch of paragraph.matchAll(
      /<a:(r|fld)(?:\s[^>]*)?>[\s\S]*?<\/a:\1>/gu,
    )) {
      const run = runMatch[0];
      const runText = drawingText(run);
      if (runText.length === 0) {
        continue;
      }

      runIndex += 1;
      const hasHebrew = hebrewPattern.test(runText);
      const hasAsciiLatin = asciiLatinPattern.test(runText);
      invariant(
        !(visible && hasHebrew && hasAsciiLatin),
        `Visible run ${runIndex} mixes Hebrew and ASCII Latin in ${path}; split it into language-specific logical runs.`,
      );

      const runProperties = run.match(/<a:rPr\b[^>]*>/u)?.[0];
      if (hasHebrew) {
        invariant(
          runProperties && hasXmlAttribute(runProperties, "lang", "he-IL"),
          `Hebrew run ${runIndex} lacks lang="he-IL" in ${path}.`,
        );
      } else if (hasAsciiLatin) {
        invariant(
          runProperties && hasXmlAttribute(runProperties, "lang", "en-US"),
          `Latin run ${runIndex} inside a Hebrew paragraph lacks lang="en-US" in ${path}.`,
        );
      }
    }
  }

  return count;
}

const deck = await requiredFile(deckPath, 50_000);
invariant(deck.subarray(0, 2).toString("ascii") === "PK", "The deck is not a PPTX archive.");
const entries = readZipEntries(deck);

const slideEntries = [...entries.keys()].filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name));
const notesEntries = [...entries.keys()].filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/u.test(name));
invariant(
  slideEntries.length >= minimumSlideCount && slideEntries.length <= maximumSlideCount,
  `Expected between ${minimumSlideCount} and ${maximumSlideCount} editable slides.`,
);
invariant(slideEntries.length === expectedSlideCount, `Expected ${expectedSlideCount} editable slides.`);
invariant(notesEntries.length === expectedSlideCount, `Expected notes on all ${expectedSlideCount} slides.`);

const slideXml = slideEntries
  .map((name) => entries.get(name)?.toString("utf8") ?? "")
  .join("\n");
for (const obsolete of [
  "627/627",
  "1443/1443",
  "28/28",
  "48 קבצים",
  "30 קבצים",
  "27.8.2026",
]) {
  invariant(!slideXml.includes(obsolete), `The deck contains an obsolete test count/date: ${obsolete}`);
}

const logicalCoverSentence = "ליגה פרטית. חיזוי הוגן. דירוג סופי שנשאר סופי.";
const reversedCoverSentence = "סופי. שנשאר סופי דירוג הוגן. חיזוי פרטית. ליגה";
const coverXml = entries.get("ppt/slides/slide1.xml")?.toString("utf8") ?? "";
invariant(
  drawingText(coverXml).includes(logicalCoverSentence),
  `The cover must store the logical Hebrew sentence: ${logicalCoverSentence}`,
);
invariant(
  !drawingText(coverXml).includes(reversedCoverSentence),
  "The cover still contains the manually reversed Hebrew sentence.",
);

let hebrewParagraphCount = 0;
for (let index = 1; index <= expectedSlideCount; index += 1) {
  const slidePath = `ppt/slides/slide${index}.xml`;
  const notesPath = `ppt/notesSlides/notesSlide${index}.xml`;
  invariant(entries.has(slidePath), `Missing editable slide ${index}.`);
  invariant(entries.has(notesPath), `Missing speaker notes for slide ${index}.`);
  const slide = entries.get(slidePath)?.toString("utf8") ?? "";
  const notes = entries.get(notesPath)?.toString("utf8") ?? "";
  hebrewParagraphCount += inspectHebrewParagraphs(slide, slidePath, { visible: true });
  hebrewParagraphCount += inspectHebrewParagraphs(notes, notesPath, { visible: false });
  requireText(notes, ["[Sources]", "[/Sources]"], `speaker notes for slide ${index}`);
}
invariant(hebrewParagraphCount > 0, "The deck must contain at least one Hebrew paragraph.");

const closingRelationships = entries
  .get("ppt/slides/_rels/slide13.xml.rels")
  ?.toString("utf8") ?? "";
requireText(
  closingRelationships,
  ["https://predictor-swart.vercel.app", "https://github.com/talzantkeren/predictor"],
  "slide 13 links",
);
invariant(
  [...entries.keys()].filter((name) => name.startsWith("ppt/media/")).length >= 2,
  "The editable deck must embed its lifecycle visuals.",
);

const renderedDimensions = new Set();
const renderedFiles = (await readdir(renderedRoot).catch(() => []))
  .filter((name) => /^slide-\d+\.png$/u.test(name));
invariant(
  renderedFiles.length === expectedSlideCount,
  `Expected exactly ${expectedSlideCount} rendered slide PNGs.`,
);
for (let index = 1; index <= expectedSlideCount; index += 1) {
  const path = `${renderedRoot}/slide-${index}.png`;
  const dimensions = pngDimensions(await requiredFile(path, 10_000), path);
  renderedDimensions.add(`${dimensions.width}x${dimensions.height}`);
}
invariant(renderedDimensions.size === 1, "Rendered slides do not share one 16:9 canvas.");

const fallbackFiles = [
  "01-open-league.png",
  "02-open-approved-members.png",
  "03-active-current-report.png",
  "04-completed-final-frozen.png",
  "05-completed-final-reconciled.png",
];
const actualFallbackFiles = (await readdir(fallbackRoot).catch(() => []))
  .filter((name) => name.endsWith(".png"))
  .sort();
invariant(
  JSON.stringify(actualFallbackFiles) === JSON.stringify([...fallbackFiles].sort()),
  `Expected exactly these fallback PNGs: ${fallbackFiles.join(", ")}.`,
);
for (const filename of fallbackFiles) {
  const path = `${fallbackRoot}/${filename}`;
  pngDimensions(await requiredFile(path, 10_000), path);
}

const demoScriptPath = `${presentationRoot}/demo-script.md`;
const presenterReadmePath = `${presentationRoot}/README.md`;
const rehearsalLogPath = `${presentationRoot}/rehearsal-log.md`;
const lifecycleSpecPath = "e2e/lifecycle.spec.ts";
const [
  demoScript,
  presenterReadme,
  rehearsalLog,
  lifecycleSpec,
  deckSource,
  timingGuide,
  evaluatorChecklist,
] = await Promise.all([
  requiredFile(demoScriptPath, 2_000),
  requiredFile(presenterReadmePath, 1_000),
  requiredFile(rehearsalLogPath, 1_000),
  requiredFile(lifecycleSpecPath, 1_000),
  requiredFile(deckSourcePath, 1_500),
  requiredFile(timingGuidePath, 1_500),
  requiredFile(evaluatorChecklistPath, 1_500),
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
requireText(
  deckSource.toString("utf8"),
  [
    "מקור העריכה הסמכותי",
    "## שקף 1",
    "## שקף 13",
    "[Sources]",
  ],
  deckSourcePath,
);
requireText(
  timingGuide.toString("utf8"),
  ["10:00–15:00", "00:00", "13:10", "20 שניות", "hard stop"],
  timingGuidePath,
);
requireText(
  evaluatorChecklist.toString("utf8"),
  [
    "OWNER_ACTION_REQUIRED",
    "<candidate-sha>",
    "13/13",
    "Production",
    "GitHub",
    "תקלה",
    "Demo בלבד",
  ],
  evaluatorChecklistPath,
);

const trackedPresentationText = Buffer.concat([
  demoScript,
  presenterReadme,
  rehearsalLog,
  deckSource,
  timingGuide,
  evaluatorChecklist,
]).toString("utf8");
invariant(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(trackedPresentationText), "Presentation text resembles a JWT.");
invariant(
  !/(?:SUPABASE_SECRET_KEY|CRON_SECRET|SPORTS_API_KEY)\s*=\s*\S+/u.test(trackedPresentationText),
  "Presentation text contains a server-secret assignment.",
);

console.log(
  `Presentation artifacts verified: ${expectedSlideCount} editable/rendered slides, ${fallbackFiles.length} fallback images, notes, deck source, timing guide, evaluator checklist and public links.`,
);
