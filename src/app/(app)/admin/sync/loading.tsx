export default function SystemSyncLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl animate-pulse px-4 py-8 sm:px-6 sm:py-12">
      <div className="h-9 w-56 rounded bg-slate-200" />
      <div className="mt-3 h-5 w-full max-w-xl rounded bg-slate-200" />
      <div className="mt-8 space-y-4">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-72 rounded-2xl border border-slate-200 bg-white"
          />
        ))}
      </div>
    </main>
  );
}
