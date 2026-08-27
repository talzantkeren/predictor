// Deterministic source for the submission presentation. Do not hand-edit the PPTX.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const runtimeNodeModules = process.env.RUNTIME_NODE_MODULES;
if (!runtimeNodeModules) {
  throw new Error(
    "RUNTIME_NODE_MODULES must point to the bundled workspace dependency directory.",
  );
}
const { default: JSZip } = await import(
  pathToFileURL(path.join(runtimeNodeModules, "jszip", "lib", "index.js")).href
);
const { FileBlob, PresentationFile } = await import(
  pathToFileURL(
    path.join(
      runtimeNodeModules,
      "@oai",
      "artifact-tool",
      "dist",
      "artifact_tool.mjs",
    ),
  ).href
);

const REPO_ROOT = process.env.PREDICTOR_REPO_ROOT
  ? path.resolve(process.env.PREDICTOR_REPO_ROOT)
  : path.resolve(import.meta.dirname, "..");
const OUTPUT_PATH = path.join(REPO_ROOT, "presentation", "predictor1-final-project.pptx");
const FALLBACK_ROOT = path.join(REPO_ROOT, "presentation", "fallback");
const FIXED_ZIP_DATE = new Date(1980, 0, 1, 0, 0, 0);
const FIXED_CORE_TIME = "2026-08-27T00:00:00Z";

const C = {
  navy: "#10233F",
  blue: "#1F75CC",
  aqua: "#14B8A6",
  aquaSoft: "#E5F7F4",
  blueSoft: "#EAF3FB",
  ink: "#17233A",
  muted: "#52647A",
  line: "#D9E2EC",
  surface: "#F4F7FA",
  white: "#FFFFFF",
  amber: "#D48A16",
  amberSoft: "#FFF4DE",
  green: "#087A5B",
  red: "#B34B4B",
};

function position(left, top, width, height) {
  return { left, top, width, height };
}

function addShape(slide, geometry, frame, fill = "none", line = "none", name) {
  return slide.shapes.add({
    geometry,
    name,
    position: frame,
    fill,
    line:
      line === "none"
        ? { style: "solid", fill: "none", width: 0 }
        : { style: "solid", fill: line, width: 1 },
    ...(geometry === "roundRect" ? { borderRadius: "rounded-xl" } : {}),
  });
}

function addText(slide, text, frame, options = {}) {
  const shape = addShape(slide, "textbox", frame, "none", "none", options.name);
  shape.text = text;
  shape.text.style = {
    typeface: "Arial",
    fontSize: options.fontSize ?? 24,
    bold: options.bold ?? false,
    color: options.color ?? C.ink,
    alignment: options.alignment ?? "right",
    verticalAlignment: options.verticalAlignment ?? "middle",
    autoFit: options.autoFit ?? "shrinkText",
    wrap: "square",
    insets: options.insets ?? { top: 0, right: 0, bottom: 0, left: 0 },
  };
  return shape;
}

function addLabel(slide, text, frame, options = {}) {
  const fill = options.fill ?? C.blueSoft;
  const line = options.line ?? fill;
  const shape = addShape(slide, "roundRect", frame, fill, line, options.name);
  shape.text = text;
  shape.text.style = {
    typeface: "Arial",
    fontSize: options.fontSize ?? 18,
    bold: options.bold ?? true,
    color: options.color ?? C.navy,
    alignment: options.alignment ?? "center",
    verticalAlignment: "middle",
    autoFit: "shrinkText",
    insets: { top: 4, right: 10, bottom: 4, left: 10 },
  };
  return shape;
}

function addLine(slide, x1, y1, x2, y2, color = C.line, width = 2) {
  return slide.shapes.add({
    geometry: "line",
    position: { left: x1, top: y1, width: x2 - x1, height: y2 - y1 },
    fill: "none",
    line: { style: "solid", fill: color, width },
  });
}

function addArrow(
  slide,
  x,
  y,
  width = 52,
  height = 18,
  color = C.blue,
  direction = "right",
) {
  return addShape(
    slide,
    direction === "left" ? "leftArrow" : "rightArrow",
    position(x, y, width, height),
    color,
    color,
  );
}

function addStandardHeader(slide, number, title, kicker) {
  addText(slide, `0${number}`.slice(-2), position(62, 38, 80, 30), {
    fontSize: 16,
    bold: true,
    color: C.blue,
    alignment: "left",
  });
  addText(slide, kicker, position(160, 35, 240, 32), {
    fontSize: 14,
    bold: true,
    color: C.muted,
    alignment: "left",
  });
  addText(slide, title, position(410, 30, 800, 58), {
    fontSize: 42,
    bold: true,
    color: C.navy,
  });
  addShape(slide, "rect", position(62, 104, 1148, 4), C.blue, C.blue);
}

function addFooter(slide, number) {
  addLine(slide, 62, 665, 1210, 665, C.line, 1);
  addText(slide, "Predictor1 · RUNI 2026 · DEMO", position(62, 674, 430, 20), {
    fontSize: 12,
    color: C.muted,
    alignment: "left",
  });
  addText(slide, String(number), position(1165, 674, 45, 20), {
    fontSize: 12,
    bold: true,
    color: C.muted,
  });
}

function addBulletRows(slide, items, frame, options = {}) {
  const rowHeight = options.rowHeight ?? Math.floor(frame.height / items.length);
  items.forEach((item, index) => {
    const y = frame.top + index * rowHeight;
    addShape(
      slide,
      "ellipse",
      position(frame.left + frame.width - 14, y + 14, 9, 9),
      options.bulletColor ?? C.aqua,
      options.bulletColor ?? C.aqua,
    );
    addText(slide, item, position(frame.left, y, frame.width - 28, rowHeight - 2), {
      fontSize: options.fontSize ?? 23,
      color: options.color ?? C.ink,
      bold: options.bold ?? false,
      verticalAlignment: "top",
    });
  });
}

async function addImage(slide, filename, frame, alt) {
  const bytes = await fs.readFile(path.join(FALLBACK_ROOT, filename));
  addShape(
    slide,
    "roundRect",
    position(frame.left - 5, frame.top - 5, frame.width + 10, frame.height + 10),
    C.white,
    C.line,
  );
  slide.images.add({
    blob: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    contentType: "image/png",
    alt,
    fit: "cover",
    position: frame,
    geometry: "roundRect",
    borderRadius: "rounded-lg",
  });
}

function setNotes(slide, point, evidence, sources) {
  slide.speakerNotes.clear();
  slide.speakerNotes.textFrame.setText([
    `נקודה: ${point}`,
    `ראיה: ${evidence}`,
    "[Sources]",
    ...sources,
    "[/Sources]",
  ]);
  slide.speakerNotes.setVisible(true);
}

function resetSlides(deck) {
  if (deck.slides.items.length === 9) {
    for (const sourceIndex of [6, 7, 7, 8]) {
      deck.slides.items[sourceIndex].duplicate();
    }
  }
  if (deck.slides.items.length !== 13) {
    throw new Error(`Expected the 9-slide source or 13-slide rebuilt deck; found ${deck.slides.items.length}.`);
  }
  for (const slide of deck.slides.items) {
    for (const image of [...slide.images.items]) image.delete();
    slide.shapes.deleteAll();
    slide.speakerNotes.clear();
    slide.background.fill = C.white;
  }
}

async function buildSlides(deck) {
  const s = deck.slides.items;

  // 1 — cover
  addShape(s[0], "rect", position(0, 0, 22, 720), C.aqua, C.aqua);
  addText(s[0], "RUNI · Internet Technologies 2026", position(72, 48, 480, 34), {
    fontSize: 17,
    bold: true,
    color: C.blue,
    alignment: "left",
  });
  addText(s[0], "Predictor1", position(72, 145, 620, 95), {
    fontSize: 72,
    bold: true,
    color: C.navy,
    alignment: "left",
  });
  addText(
    s[0],
    "ליגה פרטית. חיזוי הוגן. דירוג סופי שנשאר סופי.",
    position(510, 284, 700, 120),
    { fontSize: 46, bold: true, color: C.navy, verticalAlignment: "top" },
  );
  addShape(s[0], "rect", position(72, 438, 1138, 4), C.blue, C.blue);
  addText(
    s[0],
    "מערכת אמון למחזור חיים מלא — מהזמנה ועד יישוב תוצאה מאוחרת",
    position(410, 472, 800, 56),
    { fontSize: 25, color: C.muted },
  );
  addLabel(s[0], "הדגמה בלבד", position(1020, 562, 190, 46), {
    fill: C.amberSoft,
    line: C.amber,
    color: C.amber,
    fontSize: 20,
  });
  addText(s[0], "פרויקט גמר", position(72, 570, 260, 34), {
    fontSize: 20,
    bold: true,
    color: C.muted,
    alignment: "left",
  });
  addFooter(s[0], 1);
  setNotes(
    s[0],
    "זו מערכת אמון לליגה פרטית, לא רק מחשבון ניקוד.",
    "מחזור חיים מלא ותוצאה סופית שנשמרת במפורש.",
    ["docs/product.md §§2–3, 6", "README.md", "e2e/lifecycle.spec.ts"],
  );

  // 2 — problem
  addStandardHeader(s[1], 2, "כשהליגה מתנהלת בצ׳אט, אין מקור אמת אחד", "הבעיה והקהל");
  addText(
    s[1],
    "מנהלי ליגות פרטיות מרכזים בקשות, אסמכתאות, ניחושים ותוצאות בין הודעות וגיליונות.",
    position(490, 138, 720, 72),
    { fontSize: 25, color: C.muted },
  );
  const questions = [
    ["01", "מי בפנים?", "חברות מאושרת, לא רשימת שמות מאולתרת"],
    ["02", "מתי ננעל?", "זמן מסד אחד, לא שעון מקומי ולא זיכרון"],
    ["03", "למה הניקוד השתנה?", "כלל, תוצאה וגרסה שאפשר להסביר"],
  ];
  questions.forEach(([n, q, a], i) => {
    const y = 246 + i * 112;
    addText(s[1], n, position(74, y + 4, 90, 62), {
      fontSize: 43,
      bold: true,
      color: C.aqua,
      alignment: "left",
    });
    addText(s[1], q, position(785, y, 425, 38), { fontSize: 29, bold: true, color: C.navy });
    addText(s[1], a, position(230, y + 43, 980, 35), { fontSize: 21, color: C.muted });
    if (i < 2) addLine(s[1], 230, y + 92, 1210, y + 92, C.line, 1);
  });
  addText(s[1], "הבעיה המרכזית היא אמון — לא רק חישוב.", position(540, 590, 670, 44), {
    fontSize: 27,
    bold: true,
    color: C.blue,
  });
  addFooter(s[1], 2);
  setNotes(
    s[1],
    "הפיצול הידני יוצר מחלוקות שאין להן ראיה אחת מוסכמת.",
    "מוקדי המחלוקת הממשיים הם חברות, נעילה, ניקוד ותיקון תוצאה.",
    ["docs/product.md §§2–4, 13", "README.md — Slices 3–6"],
  );

  // 3 — roles
  addStandardHeader(s[2], 3, "תפקידים נפרדים; ההרשאה תחומה לליגה", "תפקידים וזרימות");
  await addImage(
    s[2],
    "02-open-approved-members.png",
    position(70, 168, 535, 301),
    "רשימת חברים פעילים ובה שמות תצוגה בלבד",
  );
  addLabel(s[2], "ראיה מן המוצר: שמות תצוגה בלבד", position(95, 488, 485, 38), {
    fill: C.aquaSoft,
    line: C.aqua,
    color: C.green,
    fontSize: 17,
  });
  addBulletRows(
    s[2],
    [
      "אורחים נכנסים מהזמנה; מבקשי הצטרפות מעלים תמונת הדגמה פרטית.",
      "מנהל הליגה מאשר חברות ומנהל את הליגה; חבר פעיל מנחש וצופה בדירוג.",
      "מנהל מערכת מטפל בקטלוג ובחריגי תוצאה — בלי להפוך אוטומטית לחבר בליגה.",
      "ניהול ליגה אחת אינו מעניק הרשאה לליגה אחרת.",
    ],
    position(650, 160, 560, 380),
    { rowHeight: 92, fontSize: 22 },
  );
  addText(s[2], "תפקיד הוא תחום אחריות, לא קיצור דרך להרשאה רחבה.", position(610, 572, 600, 50), {
    fontSize: 25,
    bold: true,
    color: C.blue,
  });
  addFooter(s[2], 3);
  setNotes(
    s[2],
    "תפקיד הוא תחום אחריות, לא קיצור דרך להרשאה רחבה.",
    "רשימת החברים הפעילים אינה חושפת דוא״ל, ותפקיד מערכת אינו חוצה את גבול הליגה.",
    [
      "docs/product.md §§4, 9.3–9.7, 12",
      "src/features/membership/actions.ts",
      "src/features/predictions/actions.ts",
      "e2e/join-and-proofs.spec.ts",
      "e2e/leagues.spec.ts",
    ],
  );

  // 4 — lifecycle
  addStandardHeader(s[3], 4, "המחזור המלא נראה בדמו — בלי קיצור דרך", "מפת הדגמה חיה");
  const stages = [
    { x: 830, label: "פתוחה · open", detail: "מהזמנה לבקשה, לאסמכתה ולאישור", file: "01-open-league.png" },
    { x: 450, label: "פעילה · active", detail: "מניחוש לנעילה, לניקוד ולדירוג נוכחי", file: "03-active-current-report.png" },
    { x: 70, label: "הושלמה · completed", detail: "מהקפאה לדירוג סופי וליישוב מאוחר", file: "04-completed-final-frozen.png" },
  ];
  addArrow(s[3], 785, 180, 42, 18, C.blue, "left");
  addArrow(s[3], 405, 180, 42, 18, C.blue, "left");
  for (const stage of stages) {
    addText(s[3], stage.label, position(stage.x, 139, 330, 38), {
      fontSize: 25,
      bold: true,
      color: C.navy,
      alignment: "center",
    });
    addText(s[3], stage.detail, position(stage.x, 185, 330, 50), {
      fontSize: 18,
      color: C.muted,
      alignment: "center",
    });
    await addImage(s[3], stage.file, position(stage.x, 264, 330, 186), stage.label);
  }
  addShape(s[3], "roundRect", position(70, 494, 1090, 96), C.surface, C.line);
  addText(
    s[3],
    "בדמו כל מעבר מתבצע דרך ה־UI. אין עדכון ישיר במסד כדי לזייף שלב שנראה למשתמש.",
    position(100, 510, 1030, 52),
    { fontSize: 24, bold: true, color: C.navy, alignment: "center" },
  );
  addText(s[3], "אם שלב חי אינו נצפה במהירות — עוברים לצילום המקביל, בלי לטעון שהשלב עבר.", position(170, 599, 990, 36), {
    fontSize: 18,
    color: C.muted,
  });
  addFooter(s[3], 4);
  setNotes(
    s[3],
    "אותו סיפור משתמש ממשיך ממצב פתוח עד מצב סופי.",
    "חמש תמונות הגיבוי נלכדות מאותו תרחיש Playwright מקומי; שלוש מהן מוצגות כאן כמפת הזרימה.",
    [
      "docs/product.md — S9-PDEC-001–005",
      "README.md — Slice 9",
      "e2e/lifecycle.spec.ts",
      "presentation/fallback/01-open-league.png",
      "presentation/fallback/03-active-current-report.png",
      "presentation/fallback/04-completed-final-frozen.png",
    ],
  );

  // 5 — architecture
  addStandardHeader(s[4], 5, "יישום אחד; כל כלל נאכף בשכבה הנכונה", "ארכיטקטורה");
  for (const x of [300, 570, 840]) addArrow(s[4], x, 265, 60, 22, C.blue);
  const layers = [
    { x: 75, title: "Browser", body: "RTL · טפסים · משוב\nבלי סמכות עסקית", fill: C.surface },
    { x: 350, title: "Next.js 16", body: "Server Components\nServer Actions\nRoute Handlers", fill: C.blueSoft },
    { x: 625, title: "שירותי תכונה", body: "לוגיקה משותפת\nבלי Request או React", fill: C.aquaSoft },
    { x: 900, title: "PostgreSQL", body: "RLS · אילוצים · זמן מסד\ntransactions · scoring", fill: C.amberSoft },
  ];
  for (const layer of layers) {
    addShape(s[4], "roundRect", position(layer.x, 183, 230, 210), layer.fill, C.line);
    addText(s[4], layer.title, position(layer.x + 18, 202, 194, 44), {
      fontSize: 28,
      bold: true,
      color: C.navy,
      alignment: "center",
    });
    addText(s[4], layer.body, position(layer.x + 20, 260, 190, 95), {
      fontSize: 20,
      color: C.ink,
      alignment: "center",
    });
  }
  addText(
    s[4],
    "קריאות",
    position(360, 425, 210, 28),
    { fontSize: 17, bold: true, color: C.blue, alignment: "center" },
  );
  addText(
    s[4],
    "Server Components",
    position(350, 455, 230, 32),
    { fontSize: 21, bold: true, color: C.navy, alignment: "center" },
  );
  addText(
    s[4],
    "פעולות שינוי בממשק",
    position(610, 425, 210, 28),
    { fontSize: 17, bold: true, color: C.blue, alignment: "center" },
  );
  addText(
    s[4],
    "Server Actions",
    position(600, 455, 230, 32),
    { fontSize: 21, bold: true, color: C.navy, alignment: "center" },
  );
  addText(
    s[4],
    "upload · Cron · HTTP",
    position(860, 425, 260, 28),
    { fontSize: 17, bold: true, color: C.blue, alignment: "center" },
  );
  addText(
    s[4],
    "Route Handlers",
    position(875, 455, 230, 32),
    { fontSize: 21, bold: true, color: C.navy, alignment: "center" },
  );
  addText(s[4], "יישום יחיד ב־Next.js 16; שירותי המעטפת ניתנים ב־Supabase.", position(300, 523, 910, 38), {
    fontSize: 22,
    bold: true,
    color: C.blue,
  });
  addText(s[4], "כל כלל עסקי שחייב לשרוד מרוץ מוכרע ב־PostgreSQL.", position(430, 567, 780, 38), {
    fontSize: 24,
    bold: true,
    color: C.blue,
  });
  addFooter(s[4], 5);
  setNotes(
    s[4],
    "אין backend נוסף ואין שכפול של כללים בין היישום למסד.",
    "Browser, Next.js, שירותי התכונה ו־PostgreSQL מקבלים אחריות מפורשת ונפרדת.",
    [
      "docs/architecture.md §§2–6",
      "docs/technical-plan.md §§3, 7, 9–10",
      "src/proxy.ts",
      "src/app/api/cron/sync/route.ts",
      "src/app/api/join-requests/[requestId]/proofs/route.ts",
    ],
  );

  // 6 — data model
  addStandardHeader(s[5], 6, "הפרדת הנתונים שומרת החלטות והיסטוריה", "מודל נתונים");
  const rows = [
    { y: 158, nodes: ["profiles", "join_requests", "payment_proofs"], note: "זהות → תהליך הצטרפות → היסטוריית אסמכתאות 1:N" },
    { y: 268, nodes: ["profiles + leagues", "league_members"], note: "חברות היא ישות נפרדת מן הבקשה" },
    { y: 378, nodes: ["leagues + matches", "predictions"], note: "ניחוש שומר ניקוד וגרסת חישוב" },
    { y: 488, nodes: ["matches", "match_result_reviews", "league_match_snapshots", "league_match_reconciliations"], note: "תוצאה לא־בטוחה → הקפאה → תיקון מאוחר מפורש" },
  ];
  for (const row of rows) {
    const count = row.nodes.length;
    const gap = 34;
    const totalWidth = 1090;
    const nodeWidth = (totalWidth - gap * (count - 1)) / count;
    const startX = 70;
    for (let i = 0; i < count - 1; i++) {
      const arrowX = startX + nodeWidth * (i + 1) + gap * i + 4;
      addArrow(s[5], arrowX, row.y + 25, gap - 8, 16, C.aqua);
    }
    row.nodes.forEach((node, index) => {
      const x = startX + index * (nodeWidth + gap);
      addLabel(s[5], node, position(x, row.y, nodeWidth, 64), {
        fill: index === 0 ? C.blueSoft : C.surface,
        line: index === 0 ? C.blue : C.line,
        color: C.navy,
        fontSize: count === 4 ? 14 : 18,
      });
    });
    addText(s[5], row.note, position(70, row.y + 68, 1090, 28), {
      fontSize: 17,
      color: C.muted,
      alignment: "center",
    });
  }
  addText(s[5], "בקשה, אסמכתה, חברות, ניחוש ותוצאה סופית הן ישויות שונות בכוונה.", position(300, 604, 910, 36), {
    fontSize: 23,
    bold: true,
    color: C.blue,
  });
  addFooter(s[5], 6);
  setNotes(
    s[5],
    "הפרדת הישויות שומרת היסטוריה ומונעת דריסה של המצב הסופי.",
    "התרשים משתמש בשמות הטבלאות האמיתיים מן הסכמות והמיגרציות.",
    [
      "docs/architecture.md §8",
      "docs/technical-plan.md §§6.2–6.7",
      "supabase/migrations/20260814231000_slice3_membership_and_proofs.sql",
      "supabase/migrations/20260815200500_slice5_predictions.sql",
      "supabase/migrations/20260827090000_slice9_lifecycle_schema.sql",
      "src/types/database.generated.ts",
    ],
  );

  // 7 — security
  addStandardHeader(s[6], 7, "אבטחה בשכבות — כי שכבה אחת אינה מספיקה", "אבטחה ופרטיות");
  const securityLayers = [
    ["1", "זהות", "מאמתים מחדש את זהות המשתמש בכל כניסה לפעולה"],
    ["2", "הרשאת משאב", "בדיקה מול הליגה או האסמכתה המדויקת — בנפרד מגבול הרשימה"],
    ["3", "משמעת הרשאות במסד", "RLS · least-privilege grants · SECURITY DEFINER · empty search_path"],
    ["4", "קובץ פרטי", "signature/decode → WebP → private bucket → short-lived signed URL"],
  ];
  securityLayers.forEach(([n, title, body], i) => {
    const y = 145 + i * 102;
    addText(s[6], n, position(1120, y, 70, 58), {
      fontSize: 38,
      bold: true,
      color: i === 3 ? C.aqua : C.blue,
      alignment: "center",
    });
    addText(s[6], title, position(850, y, 245, 34), { fontSize: 25, bold: true, color: C.navy });
    addText(s[6], body, position(110, y + 38, 985, 42), {
      fontSize: 20,
      color: C.muted,
      alignment: i >= 2 ? "left" : "right",
    });
    if (i < 3) addLine(s[6], 110, y + 88, 1190, y + 88, C.line, 1);
  });
  addShape(s[6], "roundRect", position(110, 570, 1080, 66), C.aquaSoft, C.aqua);
  addText(s[6], "מזהה חוקי, דפדוף תחום או ממשק מוסתר אינם הרשאה.", position(140, 581, 1020, 40), {
    fontSize: 25,
    bold: true,
    color: C.green,
    alignment: "center",
  });
  addFooter(s[6], 7);
  setNotes(
    s[6],
    "זהות, הרשאת משאב, RLS וגבול הקובץ הם בקרות נפרדות.",
    "מסלול האסמכתה המלא והבדיקות השליליות של משתמש זר מוכיחים את ההפרדה.",
    [
      "docs/security.md",
      "docs/architecture.md §§6–7, 12–13",
      "src/lib/supabase/admin.ts",
      "src/features/files/private-proof-storage.ts",
      "src/app/api/payment-proofs/[proofId]/route.ts",
      "supabase/tests/proofs.test.sql",
      "e2e/join-and-proofs.spec.ts",
    ],
  );

  // 8 — locking
  addStandardHeader(s[7], 8, "את מועד הנעילה קובע המסד", "הוגנות ונעילה");
  const lockNodes = [
    { x: 875, title: "1 · leagues", body: "נועלים את מצב הליגה" },
    { x: 625, title: "2 · league_members", body: "מוודאים חברות פעילה" },
    { x: 375, title: "3 · matches", body: "נועלים את המשחק" },
    { x: 125, title: "4 · clock_timestamp()", body: "רק עכשיו קוראים זמן" },
  ];
  for (const x of [825, 575, 325]) {
    addArrow(s[7], x, 220, 46, 18, C.aqua, "left");
  }
  lockNodes.forEach((node, i) => {
    addShape(s[7], "roundRect", position(node.x, 164, 210, 146), i === 3 ? C.amberSoft : C.blueSoft, i === 3 ? C.amber : C.blue);
    addText(s[7], node.title, position(node.x + 12, 182, 186, 40), {
      fontSize: i === 3 ? 19 : 20,
      bold: true,
      color: C.navy,
      alignment: "center",
    });
    addText(s[7], node.body, position(node.x + 18, 235, 174, 46), {
      fontSize: 18,
      color: C.muted,
      alignment: "center",
    });
  });
  addShape(s[7], "roundRect", position(125, 360, 960, 88), C.surface, C.line);
  addText(s[7], "אם kickoff_at ≤ זמן המסד — השמירה נדחית, גם אם הבקשה התחילה קודם.", position(155, 379, 900, 48), {
    fontSize: 27,
    bold: true,
    color: C.navy,
    alignment: "center",
  });
  addBulletRows(
    s[7],
    [
      "כל הזמנים נשמרים ב־UTC; ה־countdown הוא עזר תצוגה בלבד.",
      "אחרי שנצפתה התחלה, נעילת המשחק נשארת בלתי הפיכה גם אם ספק שולח מועד עתידי.",
      "בדיקת מרוץ אמיתית חוצה את גבול הפתיחה ומוכרעת לפי זמן המסד.",
    ],
    position(250, 478, 835, 142),
    { rowHeight: 46, fontSize: 20 },
  );
  addFooter(s[7], 8);
  setNotes(
    s[7],
    "משתמש אינו יכול להאריך לעצמו את חלון הניחוש באמצעות שעון מקומי או בקשה שהתעכבה.",
    "הנעילות נרכשות בסדר הקנוני ורק אחריהן נקרא clock_timestamp().",
    [
      "docs/product.md — PRED-03, PRED-04, §13",
      "docs/security.md — סדר נעילות lifecycle",
      "supabase/migrations/20260826193000_slice9_database_time_serialization.sql",
      "supabase/tests/slice9-time-serialization.test.sql",
      "e2e/prediction-lock.spec.ts",
    ],
  );

  // 9 — completion and reconciliation
  addStandardHeader(s[8], 9, "סיום ליגה הוא הקפאה אטומית", "Completion · reconciliation");
  await addImage(
    s[8],
    "05-completed-final-reconciled.png",
    position(68, 205, 510, 287),
    "דירוג סופי לאחר יישוב מפורש של תיקון מאוחר",
  );
  addLabel(s[8], "אחרי יישוב מפורש: 0 נקודות", position(120, 513, 405, 40), {
    fill: C.aquaSoft,
    line: C.aqua,
    color: C.green,
  });
  const completionRows = [
    ["שער סיום", "כל המשחקים סופיים ופתורים"],
    ["transaction · snapshot", "מצב הליגה ושתי בקשות ההמתנה נסגרים ונשמרים יחד"],
    ["LEAGUE_COMPLETED", "האסמכתאות, ההיסטוריה ויומן הביקורת נשמרים"],
    ["reconciliation", "מנוהל בגרסאות; החלטה ישנה, הפעלה חוזרת או ליגה זרה נדחות"],
  ];
  completionRows.forEach(([title, body], i) => {
    const y = 151 + i * 101;
    addText(s[8], title, position(940, y, 260, 32), { fontSize: 23, bold: true, color: C.navy });
    addText(s[8], body, position(625, y + 37, 575, 42), { fontSize: 19, color: C.muted });
    if (i < 3) addLine(s[8], 625, y + 88, 1200, y + 88, C.line, 1);
  });
  addText(s[8], "הדירוג אינו משתנה בשקט — אבל תיקון מוצדק נשאר אפשרי ומתועד.", position(470, 582, 730, 46), {
    fontSize: 25,
    bold: true,
    color: C.blue,
  });
  addFooter(s[8], 9);
  setNotes(
    s[8],
    "הדירוג הסופי נשאר סופי, אך תיקון מוצדק אפשרי במסלול מפורש ומתועד.",
    "ה־completion מקפיא snapshot וסוגר בקשות באותה transaction; התיקון המאוחר אינו חל עד reconciliation.",
    [
      "docs/product.md — S9-PDEC-002–004, LEAGUE-09, MATCH-09, JOIN-14",
      "docs/security.md — Slice 9 lifecycle",
      "supabase/migrations/20260827110000_slice9_league_completion.sql",
      "supabase/migrations/20260827120000_slice9_match_review_reconciliation.sql",
      "supabase/migrations/20260827140000_slice9_lifecycle_concurrency_hardening.sql",
      "supabase/tests/slice9-lifecycle-concurrency.test.sql",
      "e2e/lifecycle.spec.ts",
    ],
  );

  // 10 — tests
  addStandardHeader(s[9], 10, "כל שכבת בדיקה מוכיחה אמת אחרת", "ראיות שנמדדו");
  const testColumns = [
    { x: 80, value: "50 / 639", title: "Vitest", body: "קבצים / בדיקות\nחוקים, schemas, מתאמים וחישובים" },
    { x: 445, value: "31 / 1,496", title: "pgTAP", body: "קבצים / בדיקות\nconstraints, RLS, grants, אטומיות ומרוצים" },
    { x: 810, value: "38 / 38", title: "Playwright", body: "בדיקות שעברו\nזרימות משתמש, הרשאות, נגישות ו־RTL" },
  ];
  testColumns.forEach((column, i) => {
    addShape(s[9], "roundRect", position(column.x, 160, 330, 300), i === 1 ? C.aquaSoft : C.blueSoft, i === 1 ? C.aqua : C.blue);
    addText(s[9], column.value, position(column.x + 20, 190, 290, 72), {
      fontSize: 48,
      bold: true,
      color: i === 1 ? C.green : C.blue,
      alignment: "center",
    });
    addText(s[9], column.title, position(column.x + 20, 276, 290, 42), {
      fontSize: 28,
      bold: true,
      color: C.navy,
      alignment: "center",
    });
    addText(s[9], column.body, position(column.x + 28, 332, 274, 94), {
      fontSize: 19,
      color: C.muted,
      alignment: "center",
    });
  });
  addShape(s[9], "roundRect", position(80, 500, 1060, 98), C.surface, C.line);
  addText(s[9], "בסביבת הבדיקות אין פנייה לספק ספורט חי.", position(110, 509, 1000, 34), {
    fontSize: 23,
    bold: true,
    color: C.navy,
    alignment: "center",
  });
  addText(s[9], "CI · recorded fixtures · fake transport · no live Sports provider", position(110, 551, 1000, 28), {
    fontSize: 18,
    color: C.blue,
    alignment: "center",
  });
  addText(s[9], "הספירות נצפו ב־npm run verify על עץ העבודה הסופי.", position(260, 603, 880, 30), {
    fontSize: 17,
    color: C.muted,
  });
  addFooter(s[9], 10);
  setNotes(
    s[9],
    "כל סיכון נבדק בשכבה שבה הוא באמת קורה; ירוק קיים לבדו אינו ראיית סגירה.",
    "50 קובצי Vitest עם 639 בדיקות, 31 קובצי pgTAP עם 1,496 בדיקות ו־38 בדיקות Playwright נצפו בהרצה הסופית.",
    [
      "docs/testing.md",
      "docs/technical-plan.md §14",
      "package.json — test, test:db, test:e2e, verify",
      "src/**/*.test.ts",
      "supabase/tests/*.test.sql",
      "e2e/*.spec.ts",
      "docs/evidence/slice-9/w7/S9-REQ-002.md",
    ],
  );

  // 11 — scale
  addStandardHeader(s[10], 11, "קנה מידה שנמדד, לא הובטח", "EXPLAIN (ANALYZE, BUFFERS)");
  const plans = [
    ["dashboard_leagues_101", "דשבורד תחום", "51 שורות", "Function Scan"],
    ["eligible_leagues_101", "ליגות זמינות", "51 שורות", "Function Scan"],
    ["revealed_predictions_202", "ניחושים חשופים", "51 שורות", "Function Scan"],
    ["active_members_201", "חברים פעילים", "26 שורות", "Function Scan"],
  ];
  plans.forEach(([name, scope, rows, execution], i) => {
    const y = 150 + i * 91;
    addShape(
      s[10],
      "roundRect",
      position(72, y, 1138, 72),
      i === 3 ? C.aquaSoft : C.surface,
      i === 3 ? C.aqua : C.line,
    );
    addText(s[10], name, position(92, y + 9, 360, 28), {
      fontSize: 20,
      bold: true,
      color: C.navy,
      alignment: "left",
    });
    addText(s[10], "EXPLAIN ANALYZE", position(92, y + 42, 360, 18), {
      fontSize: 13,
      color: C.muted,
      alignment: "left",
    });
    addText(s[10], scope, position(470, y + 13, 270, 38), {
      fontSize: 20,
      color: C.ink,
      alignment: "center",
    });
    addLabel(s[10], execution, position(760, y + 14, 190, 40), {
      fill: C.blueSoft,
      line: C.blue,
      color: C.blue,
    });
    addLabel(s[10], rows, position(970, y + 14, 210, 40), {
      fill: i === 3 ? C.aquaSoft : C.white,
      line: i === 3 ? C.aqua : C.line,
      color: i === 3 ? C.green : C.navy,
    });
  });
  addBulletRows(
    s[10],
    [
      "הרשימות תחומות בעזרת סמן ואינדקסים; שיטת ההמשך היא Keyset pagination.",
      "הניקוד מחושב בפעולה קבוצתית במסד; הסנכרון מפוצל ומוגבל במכסה.",
      "הזמנים והשורות למעלה נצפו באותה הרצה מקומית על המועמד הסופי.",
    ],
    position(260, 527, 930, 114),
    { rowHeight: 38, fontSize: 18 },
  );
  addFooter(s[10], 11);
  setNotes(
    s[10],
    "הארכיטקטורה מספיקה ליעד הקורס משום שהשאילתות תחומות ונמדדות.",
    "ארבע תוכניות EXPLAIN ANALYZE עברו; בכל פלט נצפה Function Scan תחום, עם 51, 51, 51 ו־26 שורות.",
    [
      "docs/scale.md",
      "scripts/check-scale-plans.ts",
      "docs/evidence/slice-9/w8/S9-REQ-005.md",
      "supabase/migrations/20260826310000_slice9_keyset_pagination.sql",
      "supabase/migrations/20260827130000_slice9_active_members.sql",
    ],
  );

  // 12 — tradeoffs and risk
  addStandardHeader(s[11], 12, "גבולות אמיתיים עדיפים על הבטחות", "בחירות וסיכונים");
  addText(s[11], "בחירות מודעות", position(700, 145, 490, 44), { fontSize: 29, bold: true, color: C.navy });
  addBulletRows(
    s[11],
    [
      "מונוליט מודולרי; שירות נוסף רק לאחר מדידת צוואר בקבוק.",
      "הכללים האטומיים נשמרים ב־PostgreSQL; חוויית המשתמש נשארת ביישום.",
      "מחוץ ל־Production נשאר נתיב Manual adapter עובד ובטוח.",
    ],
    position(660, 205, 530, 240),
    { rowHeight: 78, fontSize: 21 },
  );
  addText(s[11], "סיכונים שנותרו", position(90, 145, 500, 44), { fontSize: 29, bold: true, color: C.navy });
  addBulletRows(
    s[11],
    [
      "מגבלות ספק Sports ואמינות SMTP הן תלויות תשתית חיצונית.",
      "פעולות Hosted ו־Production דורשות ראיה נפרדת של הבעלים.",
      "הרחבה תפעולית תיבחן רק מול מדידות עומס אמיתיות.",
    ],
    position(50, 205, 540, 240),
    { rowHeight: 78, fontSize: 21, bulletColor: C.amber },
  );
  addShape(s[11], "roundRect", position(80, 486, 1110, 126), C.amberSoft, C.amber);
  addText(
    s[11],
    "מצב Demo בלבד · אין גבייה או כסף אמיתי · אין generative AI בזמן ריצה",
    position(110, 505, 1050, 42),
    { fontSize: 25, bold: true, color: C.amber, alignment: "center" },
  );
  addText(s[11], "מחוץ לסביבת הייצור אין פרטי גישה לספק ואין פנייה בזמן אמת לספק נתוני ספורט.", position(110, 550, 1050, 28), {
    fontSize: 19,
    color: C.ink,
    alignment: "center",
  });
  addText(s[11], "Local · Preview · CI: Manual adapter · recorded fixtures · fake transport", position(110, 582, 1050, 24), {
    fontSize: 16,
    color: C.blue,
    alignment: "center",
  });
  addFooter(s[11], 12);
  setNotes(
    s[11],
    "המוצר אומר במפורש מה הוא אינו עושה ומה עדיין תלוי בתשתית חיצונית.",
    "מטריצת הסביבות, הנתיב הידני וסריקות bundle/log תומכים בגבולות הגרסה.",
    [
      "docs/product.md §§6, 8.2, 15",
      "docs/architecture.md §§2, 14, 19–21",
      "docs/security.md — סיכונים שיוריים",
      "docs/scale.md — גבולות ורמזי הרחבה",
      "README.md — Sports Sync",
      ".env.example",
      "scripts/check-client-secret-absence.ts",
      "scripts/check-sports-secret-boundaries.mjs",
    ],
  );

  // 13 — close
  addStandardHeader(s[12], 13, "ה־MVP הושלם; העתיד נשאר מחוץ לגבול", "סיכום והמשך");
  addText(s[12], "מימוש ה־MVP", position(700, 145, 490, 44), { fontSize: 30, bold: true, color: C.navy });
  addBulletRows(
    s[12],
    [
      "הצטרפות, ניחוש, דירוג והשלמה — מחזור מלא.",
      "תיקון מאוחר נשאר פרטי, מפורש, מנוהל בגרסאות ומתועד.",
      "אפשר להסביר מי הורשה, מתי ננעל ואיך נשמר הדירוג הסופי.",
    ],
    position(660, 205, 530, 210),
    { rowHeight: 68, fontSize: 22 },
  );
  addText(s[12], "המשך אפשרי", position(90, 145, 500, 44), { fontSize: 30, bold: true, color: C.navy });
  addBulletRows(
    s[12],
    [
      "מפרידים רכיב רק אחרי שנמדד צוואר בקבוק אמיתי.",
      "כסף אמיתי — רק אחרי שער משפטי, פרטיות וגיל.",
      "מאשרים generative AI רק לאחר שינוי היקף מאושר.",
    ],
    position(50, 205, 540, 210),
    { rowHeight: 68, fontSize: 22, bulletColor: C.amber },
  );
  addShape(s[12], "rect", position(70, 455, 1140, 4), C.blue, C.blue);
  const production = addText(s[12], "פתיחת האתר הציבורי", position(760, 495, 430, 48), {
    fontSize: 25,
    bold: true,
    color: C.blue,
    alignment: "center",
  });
  production.text.get("פתיחת האתר הציבורי").link = {
    uri: "https://predictor-swart.vercel.app",
    isExternal: true,
  };
  const github = addText(s[12], "פתיחת מאגר הקוד", position(90, 495, 430, 48), {
    fontSize: 25,
    bold: true,
    color: C.blue,
    alignment: "center",
  });
  github.text.get("פתיחת מאגר הקוד").link = {
    uri: "https://github.com/talzantkeren/predictor",
    isExternal: true,
  };
  addText(
    s[12],
    "כך Predictor1 הופך כללי ליגה פרטית להסכמות שאפשר לבדוק.",
    position(260, 572, 950, 56),
    { fontSize: 30, bold: true, color: C.navy },
  );
  addFooter(s[12], 13);
  setNotes(
    s[12],
    "העתיד מופרד בבירור ממה שנמסר ונבדק כעת.",
    "כל הרחבה מוצמדת לטריגר מתועד; קישורי Production ו־GitHub מסיימים את ההצגה.",
    [
      "docs/product.md §§5.2, 8.2, 15",
      "docs/scale.md — גבולות ורמזי הרחבה",
      "docs/architecture.md §§2, 19, 21",
      "README.md — Slice 9",
      "presentation/demo-script.md",
    ],
  );
}

function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/gu, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}

function encodeXml(value) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function containsHebrew(value) {
  return /[\u0590-\u05ff]/u.test(value);
}

function scriptClass(character) {
  if (/[\u0590-\u05ff]/u.test(character)) return "he";
  if (/[A-Za-z0-9]/u.test(character)) return "en";
  return "neutral";
}

function splitByScript(value) {
  const output = [];
  let current = "";
  let currentClass = "neutral";
  for (const character of value) {
    const nextClass = scriptClass(character);
    if (nextClass === "neutral" || currentClass === "neutral" || nextClass === currentClass) {
      current += character;
      if (currentClass === "neutral" && nextClass !== "neutral") currentClass = nextClass;
      continue;
    }
    output.push({ value: current, language: currentClass === "en" ? "en-US" : "he-IL" });
    current = character;
    currentClass = nextClass;
  }
  if (current) output.push({ value: current, language: currentClass === "en" ? "en-US" : "he-IL" });
  return output;
}

function patchTagAttribute(tag, attribute, value) {
  const pattern = new RegExp(`\\s${attribute}=(?:"[^"]*"|'[^']*')`, "u");
  if (pattern.test(tag)) return tag.replace(pattern, ` ${attribute}="${value}"`);
  return tag.replace(/\s*\/?>(?=$)/u, (ending) => ` ${attribute}="${value}"${ending}`);
}

function patchRunProperties(runXml, language) {
  if (/<a:rPr\b[^>]*\/>/u.test(runXml)) {
    return runXml.replace(/<a:rPr\b[^>]*\/>/u, (tag) => patchTagAttribute(tag, "lang", language));
  }
  if (/<a:rPr\b[^>]*>/u.test(runXml)) {
    return runXml.replace(/<a:rPr\b[^>]*>/u, (tag) => patchTagAttribute(tag, "lang", language));
  }
  return runXml.replace(/<a:t\b/u, `<a:rPr lang="${language}"/><a:t`);
}

function splitAndPatchRun(runXml) {
  const textMatch = runXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/u);
  if (!textMatch) return runXml;
  const decoded = decodeXml(textMatch[1]);
  const segments = splitByScript(decoded);
  if (segments.length <= 1) {
    const language = containsHebrew(decoded) ? "he-IL" : /[A-Za-z0-9]/u.test(decoded) ? "en-US" : "he-IL";
    return patchRunProperties(runXml, language);
  }
  const openMatch = runXml.match(/^<a:r>/u);
  const closeMatch = runXml.match(/<\/a:r>$/u);
  if (!openMatch || !closeMatch) return runXml;
  const rPrMatch = runXml.match(/<a:rPr\b[^>]*(?:\/>|>[\s\S]*?<\/a:rPr>)/u);
  const baseRPr = rPrMatch?.[0] ?? "<a:rPr/>";
  return segments
    .map(({ value, language }) => {
      const rPr = patchRunProperties(`<a:r>${baseRPr}<a:t></a:t></a:r>`, language)
        .match(/<a:rPr\b[^>]*(?:\/>|>[\s\S]*?<\/a:rPr>)/u)?.[0];
      const space = /^\s|\s$/u.test(value) ? ' xml:space="preserve"' : "";
      return `<a:r>${rPr}<a:t${space}>${encodeXml(value)}</a:t></a:r>`;
    })
    .join("");
}

function ensureParagraphRtl(paragraphXml) {
  const text = [...paragraphXml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gu)]
    .map((match) => decodeXml(match[1]))
    .join("");
  if (!containsHebrew(text)) return paragraphXml;
  let result = paragraphXml;
  if (/<a:pPr\b[^>]*\/>/u.test(result)) {
    result = result.replace(/<a:pPr\b[^>]*\/>/u, (tag) => {
      let opened = patchTagAttribute(tag.replace(/\/>$/u, ">"), "rtl", "1");
      opened = patchTagAttribute(opened, "algn", "r");
      return `${opened}<a:defRPr lang="he-IL"/></a:pPr>`;
    });
  } else if (/<a:pPr\b[^>]*>/u.test(result)) {
    result = result.replace(/<a:pPr\b[^>]*>/u, (tag) => patchTagAttribute(patchTagAttribute(tag, "rtl", "1"), "algn", "r"));
    if (/<a:defRPr\b[^>]*\/>/u.test(result)) {
      result = result.replace(/<a:defRPr\b[^>]*\/>/u, (tag) => patchTagAttribute(tag, "lang", "he-IL"));
    } else if (/<a:defRPr\b[^>]*>/u.test(result)) {
      result = result.replace(/<a:defRPr\b[^>]*>/u, (tag) => patchTagAttribute(tag, "lang", "he-IL"));
    } else {
      result = result.replace(/<\/a:pPr>/u, '<a:defRPr lang="he-IL"/></a:pPr>');
    }
  } else {
    result = result.replace(
      /<a:p(?:\s[^>]*)?>/u,
      (openingTag) => `${openingTag}<a:pPr rtl="1" algn="r"><a:defRPr lang="he-IL"/></a:pPr>`,
    );
  }
  result = result.replace(/<a:r>[\s\S]*?<\/a:r>/gu, splitAndPatchRun);
  result = result.replace(/<a:fld\b[^>]*>[\s\S]*?<\/a:fld>/gu, (fieldXml) => {
    const fieldText = [...fieldXml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gu)]
      .map((match) => decodeXml(match[1]))
      .join("");
    const language = containsHebrew(fieldText) ? "he-IL" : "en-US";
    if (/<a:rPr\b[^>]*\/>/u.test(fieldXml)) {
      return fieldXml.replace(/<a:rPr\b[^>]*\/>/u, (tag) => patchTagAttribute(tag, "lang", language));
    }
    return fieldXml.replace(/<a:t\b/u, `<a:rPr lang="${language}"/><a:t`);
  });
  if (/<a:endParaRPr\b[^>]*\/>/u.test(result)) {
    result = result.replace(/<a:endParaRPr\b[^>]*\/>/u, (tag) => patchTagAttribute(tag, "lang", "he-IL"));
  } else {
    result = result.replace(/<\/a:p>$/u, '<a:endParaRPr lang="he-IL"/></a:p>');
  }
  if (/[A-Za-z]/u.test(text)) {
    result = result.replace(
      /<\/a:pPr>/u,
      '</a:pPr><a:r><a:rPr lang="he-IL"/><a:t>&#x202B;</a:t></a:r>',
    );
    result = result.replace(
      /<a:endParaRPr\b/u,
      '<a:r><a:rPr lang="he-IL"/><a:t>&#x202C;</a:t></a:r><a:endParaRPr',
    );
  }
  return result;
}

function patchRtlXml(xml) {
  return xml.replace(/<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/gu, ensureParagraphRtl);
}

function deterministicGuid(seed) {
  const hex = createHash("sha256").update(seed).digest("hex").toUpperCase();
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}}`;
}

function normalizeCreationIds(xml, entryName) {
  let index = 0;
  let result = xml.replace(/(<a16:creationId\b[^>]*\bid=")[^"]+("[^>]*\/>)/gu, (_, before, after) => {
    const value = deterministicGuid(`${entryName}:a16:${index++}`);
    return `${before}${value}${after}`;
  });
  index = 0;
  result = result.replace(/(<p14:creationId\b[^>]*\bval=")[^"]+("[^>]*\/>)/gu, (_, before, after) => {
    const hex = createHash("sha256").update(`${entryName}:p14:${index++}`).digest("hex").slice(0, 8);
    const value = String((Number.parseInt(hex, 16) % 2_000_000_000) + 1);
    return `${before}${value}${after}`;
  });
  return result;
}

function sourcePathForRelationships(relationshipPath) {
  if (relationshipPath === "_rels/.rels") return undefined;
  const marker = "/_rels/";
  const markerIndex = relationshipPath.lastIndexOf(marker);
  if (markerIndex < 0) return undefined;
  const directory = relationshipPath.slice(0, markerIndex);
  const filename = relationshipPath.slice(markerIndex + marker.length).replace(/\.rels$/u, "");
  return `${directory}/${filename}`;
}

async function normalizePptx(rawBytes, sourceBytes) {
  const zip = await JSZip.loadAsync(rawBytes, { checkCRC32: true });
  const sourceZip = await JSZip.loadAsync(sourceBytes, { checkCRC32: true });
  const entries = new Map();
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir) entries.set(name, await entry.async("nodebuffer"));
  }
  for (const [name, entry] of Object.entries(sourceZip.files)) {
    if (!entry.dir && /^ppt\/theme\/theme\d+\.xml$/u.test(name)) {
      entries.set(name, await entry.async("nodebuffer"));
    }
  }

  for (const name of [...entries.keys()].sort()) {
    if (!/\.rels$/u.test(name)) continue;
    let relationships = entries.get(name).toString("utf8");
    const mappings = [];
    let relationshipIndex = 0;
    relationships = relationships.replace(/<Relationship\b[^>]*>/gu, (tag) => {
      const idMatch = tag.match(/\bId="([^"]+)"/u);
      if (!idMatch) return tag;
      const replacement = `rId${++relationshipIndex}`;
      mappings.push([idMatch[1], replacement]);
      return tag.replace(/\bId="[^"]+"/u, `Id="${replacement}"`);
    });
    entries.set(name, Buffer.from(relationships, "utf8"));
    const sourceName = sourcePathForRelationships(name);
    if (sourceName && entries.has(sourceName)) {
      let sourceXml = entries.get(sourceName).toString("utf8");
      for (const [oldId, newId] of mappings) {
        sourceXml = sourceXml.replaceAll(`"${oldId}"`, `"${newId}"`);
        sourceXml = sourceXml.replaceAll(`'${oldId}'`, `'${newId}'`);
      }
      entries.set(sourceName, Buffer.from(sourceXml, "utf8"));
    }
  }

  for (const [name, bytes] of entries) {
    if (!/\.xml$/u.test(name)) continue;
    let xml = bytes.toString("utf8");
    if (/^ppt\/(?:slides|notesSlides)\/[^/]+\.xml$/u.test(name)) xml = patchRtlXml(xml);
    xml = normalizeCreationIds(xml, name);
    if (name === "docProps/core.xml") {
      xml = xml
        .replace(/<dcterms:created\b[^>]*>[\s\S]*?<\/dcterms:created>/u, `<dcterms:created xsi:type="dcterms:W3CDTF">${FIXED_CORE_TIME}</dcterms:created>`)
        .replace(/<dcterms:modified\b[^>]*>[\s\S]*?<\/dcterms:modified>/u, `<dcterms:modified xsi:type="dcterms:W3CDTF">${FIXED_CORE_TIME}</dcterms:modified>`);
    }
    xml = xml.replace(/\s+\/>/gu, "/>");
    entries.set(name, Buffer.from(xml, "utf8"));
  }

  const normalized = new JSZip();
  for (const name of [...entries.keys()].sort()) {
    normalized.file(name, entries.get(name), {
      binary: true,
      date: FIXED_ZIP_DATE,
      createFolders: false,
      dosPermissions: 0,
    });
  }
  return normalized.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS",
    streamFiles: false,
  });
}

async function renderDeck(sourcePath) {
  const sourceBytes = await fs.readFile(sourcePath);
  const deck = await PresentationFile.importPptx(await FileBlob.load(sourcePath));
  resetSlides(deck);
  await buildSlides(deck);
  const raw = await PresentationFile.exportPptx(deck);
  const temporaryExport = path.join(os.tmpdir(), `predictor-presentation-export-${process.pid}.pptx`);
  await raw.save(temporaryExport);
  const rawBytes = await fs.readFile(temporaryExport);
  await fs.unlink(temporaryExport);
  return normalizePptx(rawBytes, sourceBytes);
}

async function main() {
  const check = process.argv.includes("--check");
  const outputArgumentIndex = process.argv.indexOf("--output");
  const destination = outputArgumentIndex >= 0 ? path.resolve(process.argv[outputArgumentIndex + 1]) : OUTPUT_PATH;
  const generated = await renderDeck(OUTPUT_PATH);
  if (check) {
    const current = await fs.readFile(OUTPUT_PATH);
    if (!current.equals(generated)) {
      throw new Error("Presentation drift detected. Run npm run presentation:build and commit the regenerated PPTX.");
    }
    console.log(`Presentation is deterministic and current: ${createHash("sha256").update(current).digest("hex")}`);
    return;
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, generated);
  console.log(`Wrote ${destination}`);
  console.log(`SHA-256 ${createHash("sha256").update(generated).digest("hex")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
