"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">משהו השתבש</h1>
      <button
        onClick={() => reset()}
        className="mt-4 rounded bg-slate-900 px-4 py-2 text-white"
      >
        נסה שוב
      </button>
    </main>
  );
}