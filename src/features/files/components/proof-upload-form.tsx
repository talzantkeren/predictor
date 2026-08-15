"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

const MAX_FILE_BYTES = 4_000_000;
const allowedTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function validateSelectedFile(file: File) {
  if (file.size === 0) {
    return "יש לבחור תמונה שאינה ריקה.";
  }

  if (file.size > MAX_FILE_BYTES) {
    return "התמונה גדולה מדי. הגודל המרבי הוא 4 MB.";
  }

  if (file.name.length > 255) {
    return "שם הקובץ ארוך מדי.";
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (!extension || allowedTypes[extension] !== file.type) {
    return "יש לבחור JPEG, PNG או WebP עם סיומת וסוג תואמים.";
  }

  return undefined;
}

function getSafeResponseMessage(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const directMessage =
    "message" in value && typeof value.message === "string"
      ? value.message
      : undefined;
  const nestedMessage =
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "message" in value.error &&
    typeof value.error.message === "string"
      ? value.error.message
      : undefined;
  const message = directMessage ?? nestedMessage;

  if (message && message.length <= 300) {
    return message;
  }

  return undefined;
}

export function ProofUploadForm({
  requestId,
  proofCount,
}: {
  requestId: string;
  proofCount: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [idempotencyKey, setIdempotencyKey] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(undefined);
    setFile(null);
    setIdempotencyKey(undefined);
    setMessage(undefined);

    if (!selectedFile) {
      setError(undefined);
      return;
    }

    const validationError = validateSelectedFile(selectedFile);

    if (validationError) {
      setError(validationError);
      event.target.value = "";
      return;
    }

    setError(undefined);
    setFile(selectedFile);
    setIdempotencyKey(crypto.randomUUID());
    setPreviewUrl(URL.createObjectURL(selectedFile));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("יש לבחור תמונת Demo לפני ההעלאה.");
      return;
    }

    const validationError = validateSelectedFile(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    const uploadKey = idempotencyKey ?? crypto.randomUUID();
    setIdempotencyKey(uploadKey);
    setPending(true);
    setError(undefined);
    setMessage("מעלים ומעבדים את תמונת ה־Demo...");

    try {
      const formData = new FormData();
      formData.set("proof", file);
      formData.set("idempotencyKey", uploadKey);

      const response = await fetch(
        `/api/join-requests/${encodeURIComponent(requestId)}/proofs`,
        {
          method: "POST",
          body: formData,
          credentials: "same-origin",
        },
      );
      const responseBody: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(undefined);
        setError(
          getSafeResponseMessage(responseBody) ??
            "לא ניתן להעלות את התמונה כרגע. הקובץ נשאר נבחר ואפשר לנסות שוב.",
        );
        return;
      }

      setMessage("תמונת ה־Demo נשמרה והבקשה עודכנה.");
      setFile(null);
      setIdempotencyKey(undefined);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(undefined);
      }

      if (inputRef.current) {
        inputRef.current.value = "";
      }

      router.refresh();
    } catch {
      setMessage(undefined);
      setError(
        "החיבור נקטע. הקובץ נשאר נבחר ואפשר לנסות שוב בלי ליצור רשומה כפולה.",
      );
    } finally {
      setPending(false);
    }
  }

  if (proofCount >= 5) {
    return (
      <p
        role="status"
        className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
      >
        נשמרו חמש תמונות Demo לבקשה זו, ולכן לא ניתן להעלות תמונה נוספת.
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div
        id={`proof-demo-notice-${requestId}`}
        role="note"
        className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950"
      >
        זהו דמו בלבד — אין להעביר כסף ואין להעלות מסמך פיננסי אמיתי.
      </div>

      {error ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 outline-none focus:ring-2 focus:ring-red-300"
        >
          {error}
        </div>
      ) : null}

      <div aria-live="polite" aria-atomic="true">
        {message ? (
          <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            {message}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor={`proof-file-${requestId}`}
          className="block text-sm font-semibold text-slate-800"
        >
          תמונת Demo מסוג JPEG, PNG או WebP
        </label>
        <input
          ref={inputRef}
          id={`proof-file-${requestId}`}
          name="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={selectFile}
          disabled={pending}
          aria-invalid={Boolean(error)}
          aria-describedby={`proof-help-${requestId} proof-demo-notice-${requestId}`}
          className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:me-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-semibold file:text-blue-800 hover:file:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60"
        />
        <p id={`proof-help-${requestId}`} className="mt-2 text-sm leading-6 text-slate-500">
          עד 4 MB. הבדיקה בדפדפן היא עזר בלבד; השרת בודק ומקודד את התמונה מחדש.
        </p>
      </div>

      {file && previewUrl ? (
        <figure className="max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="relative aspect-video overflow-hidden rounded-lg bg-white">
            <Image
              src={previewUrl}
              alt="תצוגה מקדימה של תמונת ה־Demo שנבחרה"
              fill
              unoptimized
              className="object-contain"
            />
          </div>
          <figcaption className="mt-2 break-all text-sm text-slate-600" dir="ltr">
            {file.name}
          </figcaption>
        </figure>
      ) : null}

      <button
        type="submit"
        disabled={pending || !file}
        className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "מעלים..." : proofCount > 0 ? "העלאת תמונת Demo חלופית" : "העלאת תמונת Demo"}
      </button>
    </form>
  );
}
