export default function DashboardLoading() {
  return (
    <main
      className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
      aria-busy="true"
      aria-label="טוענים את הלוח האישי"
    >
      <div className="motion-safe:animate-pulse motion-reduce:animate-none">
        <div className="h-10 w-56 rounded-lg bg-line" />
        <div className="mt-3 h-5 w-80 max-w-full rounded bg-line" />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {[1, 2].map((item) => (
            <div key={item} className="h-56 rounded-2xl border border-line bg-white" />
          ))}
        </div>
        <div className="mt-10 h-64 rounded-2xl border border-line bg-white" />
      </div>
    </main>
  );
}
