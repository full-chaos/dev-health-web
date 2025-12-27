import Link from "next/link";

import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth, getExplainData } from "@/lib/api";
import { formatDelta, formatMetricValue } from "@/lib/formatters";

const FILTERS = {
  Who: ["Org", "Team", "Repo"],
  What: ["Cycle Time", "Review Latency", "Throughput"],
  Why: ["WIP", "Churn", "Quality"],
  How: ["Deploys", "Incidents", "Coverage"],
};

type ExplorePageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Explore({ searchParams }: ExplorePageProps) {
  const health = await checkApiHealth();
  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  const params = (await searchParams) ?? {};
  const metric = (params.metric as string) ?? "cycle_time";
  const data = await getExplainData({ metric }).catch(() => null);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-16 pt-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
              Explorer
            </p>
            <h1 className="mt-2 font-[var(--font-display)] text-3xl">
              {data?.label ?? "Explore"}
            </h1>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Drivers, contributors, and evidence links.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[var(--card-stroke)] px-4 py-2 text-xs uppercase tracking-[0.2em]"
          >
            Back to Home
          </Link>
        </header>

        <section className="grid gap-6 lg:grid-cols-[0.28fr_0.72fr]">
          <aside className="space-y-4 rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
            {Object.entries(FILTERS).map(([label, items]) => (
              <div key={label}>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  {label}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {items.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-[var(--card-stroke)] bg-white/60 px-3 py-1"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <div className="space-y-6">
            <div className="rounded-3xl border border-[var(--card-stroke)] bg-white/80 p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Current Window
              </p>
              <div className="mt-3 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-semibold">
                  {data ? formatMetricValue(data.value, data.unit) : "--"}
                </span>
                <span className="text-sm text-[var(--ink-muted)]">
                  {data ? formatDelta(data.delta_pct) : "--"} vs previous window
                </span>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
                <h2 className="font-[var(--font-display)] text-xl">Top Drivers</h2>
                <div className="mt-3 space-y-3 text-sm">
                  {(data?.drivers ?? []).map((driver) => (
                    <Link
                      key={driver.id}
                      href={driver.evidence_link}
                      className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-white/70 px-4 py-3"
                    >
                      <span>{driver.label}</span>
                      <span className="text-xs text-[var(--ink-muted)]">
                        {formatDelta(driver.delta_pct)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
                <h2 className="font-[var(--font-display)] text-xl">Contributors</h2>
                <div className="mt-3 space-y-3 text-sm">
                  {(data?.contributors ?? []).map((contributor) => (
                    <Link
                      key={contributor.id}
                      href={contributor.evidence_link}
                      className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-white/70 px-4 py-3"
                    >
                      <span>{contributor.label}</span>
                      <span className="text-xs text-[var(--ink-muted)]">
                        {data ? formatMetricValue(contributor.value, data.unit) : "--"}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--card-stroke)] bg-white/80 p-5">
              <h2 className="font-[var(--font-display)] text-xl">Evidence Links</h2>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {Object.entries(data?.drilldown_links ?? {}).map(([label, link]) => (
                  <Link
                    key={label}
                    href={link}
                    className="rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-2"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
