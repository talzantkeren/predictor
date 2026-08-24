import type { ReactNode } from "react";

type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "error"
  | "locked";

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-surface-subtle text-ink-secondary",
  info: "bg-navy-100 text-navy-900",
  success: "bg-success-50 text-success-900",
  warning: "border border-warning-200 bg-warning-50 text-warning-900",
  error: "border border-error-200 bg-error-50 text-error-900",
  locked: "bg-locked-50 text-locked-900",
};

const toneSymbols: Record<StatusTone, string> = {
  neutral: "●",
  info: "●",
  success: "✓",
  warning: "!",
  error: "×",
  locked: "▪",
};

export function StatusBadge({
  children,
  tone = "neutral",
  symbol,
}: {
  children: ReactNode;
  tone?: StatusTone;
  symbol?: string;
}) {
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${toneClasses[tone]}`}
    >
      <span aria-hidden="true">{symbol ?? toneSymbols[tone]}</span>
      <span>{children}</span>
    </span>
  );
}
