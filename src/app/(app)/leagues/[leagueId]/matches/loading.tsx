export default function LeagueMatchesLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12" aria-busy="true">
      <p className="text-sm font-semibold text-blue-700">טוענים משחקים...</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
    </main>
  );
}
