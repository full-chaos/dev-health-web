import Link from "next/link";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { defaultMetricFilter } from "@/lib/filters/defaults";

export default function CoveragePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={defaultMetricFilter} active="coverage" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                TestOps
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Coverage
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Code coverage metrics and trends.
              </p>
            </div>
            <Link
              href="/testops"
              className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Back to TestOps
            </Link>
          </header>
          <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-10 text-center">
            <p className="text-(--ink-muted)">Coverage view is under construction.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
