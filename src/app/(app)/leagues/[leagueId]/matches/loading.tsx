export default function LeagueMatchesLoading() {
  return (
    <main
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
      aria-busy="true"
      aria-label="טוענים משחקים וניחושים"
    >
      <div className="motion-safe:animate-pulse motion-reduce:animate-none">
        <div className="h-40 rounded-2xl border border-line bg-white" />
        <div className="mt-5 h-14 rounded-2xl border border-line bg-white" />
        <div className="mt-6 space-y-6">
          {[1, 2].map((round) => (
            <article
              key={round}
              className="overflow-hidden rounded-2xl border border-line bg-white shadow-card"
            >
              <div className="grid gap-4 border-b border-line px-4 py-5 sm:grid-cols-[minmax(0,1fr)_18rem] sm:px-6">
                <div>
                  <div className="h-8 w-32 rounded bg-line" />
                  <div className="mt-3 h-4 w-64 max-w-full rounded bg-line" />
                </div>
                <div className="h-10 rounded bg-line" />
              </div>
              {[1, 2, 3].map((match) => (
                <div
                  key={match}
                  className="grid min-h-28 gap-4 border-t border-line px-4 py-5 first:border-t-0 sm:px-6 lg:grid-cols-[11rem_minmax(0,1fr)_12rem]"
                >
                  <div className="h-7 w-24 rounded-full bg-line" />
                  <div className="h-12 rounded bg-line" />
                  <div className="h-11 rounded bg-line" />
                </div>
              ))}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
