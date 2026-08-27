import { z } from "zod";

const cursorTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .refine(
    (value) => !value.startsWith("0000-") && Number.isFinite(Date.parse(value)),
    "Cursor timestamp must be finite.",
  );

const cursorSchema = z
  .object({
    at: cursorTimestampSchema,
    id: z.string().uuid(),
  })
  .strict();

export type KeysetCursor = z.infer<typeof cursorSchema>;

export type KeysetPage<T> =
  | { items: T[]; hasMore: false; nextCursor: null }
  | { items: T[]; hasMore: true; nextCursor: string };

export function encodeKeysetCursor(cursor: KeysetCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeKeysetCursor(value: unknown): KeysetCursor | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return null;
  }

  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (!parsed.success || encodeKeysetCursor(parsed.data) !== value) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function parseOptionalKeysetCursor(value: unknown):
  | { success: true; data: KeysetCursor | undefined }
  | { success: false } {
  if (value === undefined) {
    return { success: true, data: undefined };
  }

  const cursor = decodeKeysetCursor(value);
  return cursor
    ? { success: true, data: cursor }
    : { success: false };
}

type KeysetTimestampColumn =
  | "approved_at"
  | "created_at"
  | "kickoff_at"
  | "updated_at";

export function getPostgrestKeysetFilter(
  column: KeysetTimestampColumn,
  direction: "ascending" | "descending",
  cursor: KeysetCursor,
) {
  const operator = direction === "ascending" ? "gt" : "lt";
  return `${column}.${operator}.${cursor.at},and(${column}.eq.${cursor.at},id.${operator}.${cursor.id})`;
}

export function buildKeysetPage<Row, Item>(
  rows: Row[],
  pageSize: number,
  mapItem: (row: Row) => Item,
  getCursor: (row: Row) => KeysetCursor,
): KeysetPage<Item> {
  const visibleRows = rows.slice(0, pageSize);
  const lastRow = visibleRows.at(-1);
  const hasMore = rows.length > pageSize;

  const items = visibleRows.map(mapItem);

  if (hasMore && lastRow) {
    return {
      items,
      hasMore: true,
      nextCursor: encodeKeysetCursor(getCursor(lastRow)),
    };
  }

  return { items, hasMore: false, nextCursor: null };
}
