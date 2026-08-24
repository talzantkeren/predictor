import type { ReactNode } from "react";

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-line bg-white p-6 text-center sm:p-8">
      <span
        aria-hidden="true"
        className="mx-auto grid size-14 place-items-center rounded-2xl bg-navy-100 text-lg font-black text-navy-900"
      >
        P1
      </span>
      <h2 className="mt-4 text-xl font-extrabold text-ink">{title}</h2>
      <div className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink-secondary">
        {children}
      </div>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </section>
  );
}
