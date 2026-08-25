export default function ManagerReportsLoading() {
  return (
    <main
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
      aria-busy="true"
      aria-label="טוענים את דוח המנהל"
    >
      <div className="motion-safe:animate-pulse motion-reduce:animate-none">
        <div className="h-40 rounded-2xl border border-line bg-white" />
        <div className="mt-5 h-14 rounded-2xl border border-line bg-white" />
        <div className="mt-6 h-24 rounded-xl border border-warning-200 bg-warning-50" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-36 rounded-2xl border border-line bg-white"
            />
          ))}
        </div>
        <div className="mt-8 h-80 rounded-2xl border border-line bg-white" />
      </div>
    </main>
  );
}
