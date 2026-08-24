import type { ReactNode } from "react";

export function DemoNotice({
  children,
  title = "Demo בלבד — ללא כסף אמיתי",
  className = "",
}: {
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <aside
      aria-label="הודעת מצב Demo"
      className={`rounded-xl border border-warning-200 bg-warning-50 p-4 text-warning-900 ${className}`}
    >
      <h2 className="flex items-center gap-2 font-extrabold">
        <span aria-hidden="true">◆</span>
        {title}
      </h2>
      <div className="mt-1.5 text-sm leading-6">{children}</div>
    </aside>
  );
}
