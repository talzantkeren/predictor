import type { ReactNode } from "react";

export function ErrorState({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-error-200 bg-error-50 p-4 font-semibold leading-6 text-error-900"
    >
      <span aria-hidden="true" className="me-2 font-black">
        ×
      </span>
      {children}
    </div>
  );
}
