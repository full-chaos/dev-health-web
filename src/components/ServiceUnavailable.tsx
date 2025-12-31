import Link from "next/link";

export function ServiceUnavailable() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-3xl flex-col items-start gap-6 px-6 pb-20 pt-16">
        <p className="text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
          Dev Health Ops
        </p>
        <h1 className="font-(--font-display) text-3xl">
          Data service unavailable
        </h1>
        <p className="text-sm text-(--ink-muted)">
          The API status check failed. ClickHouse and the API must be available
          to load this view.
        </p>
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 text-sm text-(--ink-muted)">
          <p>Quick checks:</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>API at http://localhost:8000/docs</li>
            <li>ClickHouse at http://localhost:8123</li>
          </ul>
        </div>
        <Link
          href="/"
          className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
        >
          Retry
        </Link>
      </main>
    </div>
  );
}
