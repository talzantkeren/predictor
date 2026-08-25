export default function LeagueStandingsLoading() {
  return (
    <main
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
      aria-busy="true"
      aria-label="טוענים את טבלת הדירוג"
    >
      <div className="motion-safe:animate-pulse motion-reduce:animate-none">
        <div className="h-40 rounded-2xl border border-line bg-white" />
        <div className="mt-5 h-14 rounded-2xl border border-line bg-white" />
        <div className="mt-6 h-80 rounded-2xl border border-line bg-white" />
      </div>
    </main>
  );
}
