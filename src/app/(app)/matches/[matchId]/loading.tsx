export default function MatchDetailLoading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12" aria-busy="true">
      <p className="text-sm font-semibold text-blue-700">טוענים את המשחק...</p>
      <div className="mt-5 h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      <div className="mt-5 h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </main>
  );
}
