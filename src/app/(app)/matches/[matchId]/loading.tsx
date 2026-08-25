export default function MatchDetailLoading() {
  return (
    <main
      className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12"
      aria-busy="true"
      aria-label="טוענים את פרטי המשחק"
    >
      <div className="motion-safe:animate-pulse motion-reduce:animate-none">
        <div className="h-10 w-80 max-w-full rounded-lg bg-line" />
        <div className="mt-6 rounded-2xl border border-line bg-white p-5 shadow-card sm:p-8">
          <div className="h-7 w-40 rounded bg-line" />
          <div className="mt-8 grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)] gap-4">
            <div className="h-12 rounded bg-line" />
            <div className="h-12 rounded-lg bg-navy-100" />
            <div className="h-12 rounded bg-line" />
          </div>
          <div className="mt-8 h-20 border-t border-line pt-5">
            <div className="h-5 rounded bg-line" />
          </div>
        </div>
        <div className="mt-6 h-64 rounded-2xl border border-line bg-white shadow-card" />
        <div className="mt-6 h-56 rounded-2xl border border-line bg-white shadow-card" />
      </div>
    </main>
  );
}
