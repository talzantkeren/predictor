export default function SystemMatchesLoading() {
  return (
    <main
      className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12"
      aria-busy="true"
      aria-label="טוענים את ניהול המשחקים"
    >
      <div className="motion-safe:animate-pulse motion-reduce:animate-none">
        <div className="h-9 w-56 rounded bg-slate-200" />
        <div className="mt-3 h-5 w-full max-w-xl rounded bg-slate-200" />
        <div className="mt-8 space-y-5">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-64 rounded-2xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
