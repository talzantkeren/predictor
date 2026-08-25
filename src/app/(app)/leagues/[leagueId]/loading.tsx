export default function LeagueLoading() {
  return (
    <main
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
      aria-busy="true"
      aria-label="טוענים את הליגה"
    >
      <div className="motion-safe:animate-pulse motion-reduce:animate-none">
        <div className="h-10 w-64 max-w-full rounded-lg bg-line" />
        <div className="mt-3 h-5 w-96 max-w-full rounded bg-line" />
        <div className="mt-8 h-14 rounded-xl border border-line bg-white" />
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="h-64 rounded-2xl border border-line bg-white" />
          <div className="h-64 rounded-2xl border border-line bg-white" />
        </div>
      </div>
    </main>
  );
}
