export type ProofErrorCode =
  | "DEMO_MODE_REQUIRED"
  | "INVALID_ORIGIN"
  | "UNAUTHENTICATED"
  | "RESOURCE_UNAVAILABLE"
  | "REQUEST_NOT_UPLOADABLE"
  | "INVALID_REQUEST_ID"
  | "INVALID_PROOF_ID"
  | "INVALID_CONTENT_LENGTH"
  | "REQUEST_TOO_LARGE"
  | "INVALID_MULTIPART"
  | "UNEXPECTED_FORM_FIELD"
  | "MISSING_FILE"
  | "DUPLICATE_FILE"
  | "MISSING_IDEMPOTENCY_KEY"
  | "DUPLICATE_IDEMPOTENCY_KEY"
  | "INVALID_IDEMPOTENCY_KEY"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "INVALID_FILENAME"
  | "UNSUPPORTED_EXTENSION"
  | "UNSUPPORTED_MIME_TYPE"
  | "UNSUPPORTED_SIGNATURE"
  | "IMAGE_TYPE_MISMATCH"
  | "CORRUPT_IMAGE"
  | "IMAGE_PIXEL_LIMIT_EXCEEDED"
  | "ANIMATED_IMAGE_NOT_ALLOWED"
  | "SANITIZED_IMAGE_TOO_LARGE"
  | "RATE_LIMITED"
  | "PROOF_LIMIT_REACHED"
  | "IDEMPOTENCY_CONFLICT"
  | "STORAGE_UNAVAILABLE"
  | "INTERNAL_ERROR";

const safeMessages: Record<ProofErrorCode, string> = {
  DEMO_MODE_REQUIRED: "העלאת אסמכתאות זמינה במצב Demo בלבד.",
  INVALID_ORIGIN: "לא ניתן לאמת את מקור הבקשה.",
  UNAUTHENTICATED: "יש להתחבר כדי להמשיך.",
  RESOURCE_UNAVAILABLE: "האסמכתאה או הבקשה אינן זמינות.",
  REQUEST_NOT_UPLOADABLE: "לא ניתן להעלות אסמכתאה במצב הנוכחי של הבקשה.",
  INVALID_REQUEST_ID: "מזהה הבקשה אינו תקין.",
  INVALID_PROOF_ID: "מזהה האסמכתאה אינו תקין.",
  INVALID_CONTENT_LENGTH: "מבנה בקשת ההעלאה אינו תקין.",
  REQUEST_TOO_LARGE: "בקשת ההעלאה גדולה מהמותר.",
  INVALID_MULTIPART: "טופס ההעלאה אינו תקין.",
  UNEXPECTED_FORM_FIELD: "טופס ההעלאה כולל שדה שאינו נתמך.",
  MISSING_FILE: "יש לבחור תמונת Demo להעלאה.",
  DUPLICATE_FILE: "ניתן להעלות תמונה אחת בכל בקשה.",
  MISSING_IDEMPOTENCY_KEY: "מזהה ניסיון ההעלאה חסר.",
  DUPLICATE_IDEMPOTENCY_KEY: "מזהה ניסיון ההעלאה נשלח יותר מפעם אחת.",
  INVALID_IDEMPOTENCY_KEY: "מזהה ניסיון ההעלאה אינו תקין.",
  EMPTY_FILE: "התמונה שנבחרה ריקה.",
  FILE_TOO_LARGE: "גודל התמונה המרבי הוא 4,000,000 בתים.",
  INVALID_FILENAME: "שם הקובץ אינו תקין או ארוך מדי.",
  UNSUPPORTED_EXTENSION: "סיומת הקובץ חייבת להיות JPG, JPEG, PNG או WebP.",
  UNSUPPORTED_MIME_TYPE: "סוג הקובץ חייב להיות JPEG, PNG או WebP.",
  UNSUPPORTED_SIGNATURE: "תוכן הקובץ אינו תמונת JPEG, PNG או WebP תקינה.",
  IMAGE_TYPE_MISMATCH: "סיומת הקובץ, סוגו ותוכנו אינם תואמים.",
  CORRUPT_IMAGE: "לא ניתן לפענח את התמונה. ייתכן שהקובץ פגום.",
  IMAGE_PIXEL_LIMIT_EXCEEDED: "ממדי התמונה גדולים מהמותר.",
  ANIMATED_IMAGE_NOT_ALLOWED: "תמונה מונפשת או מרובת עמודים אינה נתמכת.",
  SANITIZED_IMAGE_TOO_LARGE: "לא ניתן לעבד את התמונה לגודל המותר.",
  RATE_LIMITED: "בוצעו יותר מדי ניסיונות העלאה. יש לנסות שוב מאוחר יותר.",
  PROOF_LIMIT_REACHED: "הבקשה הגיעה למספר המרבי של אסמכתאות Demo.",
  IDEMPOTENCY_CONFLICT: "מזהה ניסיון ההעלאה כבר שימש לתמונה אחרת.",
  STORAGE_UNAVAILABLE: "לא ניתן לשמור את התמונה כרגע. יש לנסות שוב.",
  INTERNAL_ERROR: "אירעה שגיאה. יש לנסות שוב.",
};

export class ProofError extends Error {
  readonly code: ProofErrorCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;
  readonly definitiveDatabaseRejection: boolean;
  readonly definitiveStorageRejection: boolean;

  constructor(
    code: ProofErrorCode,
    status: number,
    options: {
      retryAfterSeconds?: number;
      cause?: unknown;
      definitiveDatabaseRejection?: boolean;
      definitiveStorageRejection?: boolean;
    } = {},
  ) {
    super(safeMessages[code], { cause: options.cause });
    this.name = "ProofError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.definitiveDatabaseRejection =
      options.definitiveDatabaseRejection ?? false;
    this.definitiveStorageRejection =
      options.definitiveStorageRejection ?? false;
  }
}

export function isDefinitiveProofDatabaseRejection(error: unknown) {
  return (
    error instanceof ProofError && error.definitiveDatabaseRejection === true
  );
}

export function isDefinitiveProofStorageRejection(error: unknown) {
  return (
    error instanceof ProofError && error.definitiveStorageRejection === true
  );
}

export function getProofError(error: unknown) {
  return error instanceof ProofError
    ? error
    : new ProofError("INTERNAL_ERROR", 500, { cause: error });
}

function getErrorMessage(error: unknown) {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return undefined;
  }

  return typeof error.message === "string" ? error.message : undefined;
}

function getPostgresErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)
    ? code
    : undefined;
}

function isDefinitivePostgresRejection(error: unknown) {
  const code = getPostgresErrorCode(error);

  if (!code) {
    return false;
  }

  return (
    code === "P0001" ||
    code.startsWith("22") ||
    code.startsWith("23") ||
    (code.startsWith("40") && code !== "40003")
  );
}

const definitiveStorageUploadRejectionStatuses = new Set([
  400, 401, 403, 404, 409, 411, 413, 415, 422, 429,
]);

function getStorageHttpStatus(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const record = error as Record<string, unknown>;

  if (typeof record.status === "number") {
    return record.status;
  }

  if (
    typeof record.statusCode === "string" &&
    /^[1-5][0-9]{2}$/.test(record.statusCode)
  ) {
    return Number(record.statusCode);
  }

  return undefined;
}

export function mapProofStorageUploadError(error: unknown) {
  const status = getStorageHttpStatus(error);

  return new ProofError("STORAGE_UNAVAILABLE", 503, {
    cause: error,
    definitiveStorageRejection:
      status !== undefined &&
      definitiveStorageUploadRejectionStatuses.has(status),
  });
}

export function mapProofDatabaseError(error: unknown) {
  const message = getErrorMessage(error);

  function rejection(code: ProofErrorCode, status: number) {
    return new ProofError(code, status, {
      cause: error,
      definitiveDatabaseRejection: isDefinitivePostgresRejection(error),
    });
  }

  switch (message) {
    case "UNAUTHENTICATED":
      return rejection("UNAUTHENTICATED", 401);
    case "FORBIDDEN":
    case "REQUEST_NOT_FOUND":
    case "PROOF_NOT_FOUND":
      return rejection("RESOURCE_UNAVAILABLE", 404);
    case "REQUEST_NOT_UPLOADABLE":
    case "JOIN_REQUEST_STATE_CONFLICT":
    case "STATE_CONFLICT":
      return rejection("REQUEST_NOT_UPLOADABLE", 409);
    case "PROOF_LIMIT_REACHED":
      return rejection("PROOF_LIMIT_REACHED", 409);
    case "PROOF_IDEMPOTENCY_CONFLICT":
    case "IDEMPOTENCY_CONFLICT":
      return rejection("IDEMPOTENCY_CONFLICT", 409);
    case "RATE_LIMITED":
      return rejection("RATE_LIMITED", 429);
    case "PROOF_OBJECT_MISSING":
      return rejection("STORAGE_UNAVAILABLE", 503);
    case "VALIDATION_ERROR":
      return rejection("INTERNAL_ERROR", 500);
    default:
      return new ProofError("INTERNAL_ERROR", 500, {
        cause: error,
        definitiveDatabaseRejection: isDefinitivePostgresRejection(error),
      });
  }
}
