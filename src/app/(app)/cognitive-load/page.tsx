import { ContextStrip } from "@/components/navigation/ContextStrip";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";

type CognitiveLoadPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const signals = [
  {
    label: "PR interruption load",
    value: "18",
    delta: "-12% vs prior week",
    description: "Reviews, first-review events, and review feedback interrupting focused delivery.",
  },
  {
    label: "Context spread",
    value: "7",
    delta: "+2 active contexts",
    description: "Distinct repos, PRs, reviews, and touched file areas in the selected team scope.",
  },
  {
    label: "Review request load",
    value: "11",
    delta: "+4 requests",
    description: "Aggregate review requests handled by the team, never a person-level queue ranking.",
  },
  {
    label: "After-hours trend",
    value: "14%",
    delta: "flat 3-week trend",
    description: "Existing commit-time rollups outside weekday business hours.",
  },
  {
    label: "Weekend trend",
    value: "6%",
    delta: "down 3 points",
    description: "Existing weekend activity ratio, aggregated before it reaches this surface.",
  },
];

const trend = [28, 34, 26, 31, 24, 20, 18];

export default async function CognitiveLoadPage({ searchParams }: CognitiveLoadPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;
  const activeOrigin = typeof originParam === "string" ? originParam : undefined;
  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="cognitive-load" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-6" data-testid="cognitive-load-dashboard">
          <ContextStrip filters={filters} origin={activeOrigin} />

          <section className="overflow-hidden rounded-[2rem] border border-(--card-stroke) bg-(--card-80) shadow-sm">
            <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-(--ink-muted)">
                  Privacy-first cognitive load
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
                  Focus fragmentation, not surveillance.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-(--ink-muted) md:text-base">
                  This surface uses existing PR, review, work-item, and commit-time rollups to show where attention is being split. It does not collect IDE, keystroke, prompt, or session telemetry.
                </p>
              </div>
              <div className="border-t border-(--card-stroke) bg-(--card-60) p-8 lg:border-l lg:border-t-0">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--ink-muted)">
                  Guardrail
                </p>
                <div className="mt-4 space-y-3 text-sm text-(--ink-muted)">
                  <p>No leaderboards. No peer rankings. Team and repo aggregation comes first.</p>
                  <p>Single-person views are limited to explicit self-reflection or coaching context.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {signals.map((signal) => (
              <article key={signal.label} className="rounded-3xl border border-(--card-stroke) bg-card p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
                  {signal.label}
                </p>
                <p className="mt-5 text-4xl font-semibold tabular-nums">{signal.value}</p>
                <p className="mt-2 text-xs font-medium text-emerald-600">{signal.delta}</p>
                <p className="mt-4 text-sm leading-6 text-(--ink-muted)">{signal.description}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[1.75rem] border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--ink-muted)">
                Aggregation contract
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Team/repo-first by default</h2>
              <p className="mt-3 text-sm leading-6 text-(--ink-muted)">
                Cognitive-load signals are presented as system pressure: review queues, context spread, after-hours trend, and weekend trend. They are coaching prompts, not performance judgments.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--ink-muted)">
                    Fragmentation trend
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">Seven-day load index</h2>
                </div>
                <span className="rounded-full border border-(--card-stroke) px-3 py-1 text-xs text-(--ink-muted)">
                  Sample data
                </span>
              </div>
              <div className="mt-8 flex h-32 items-end gap-3" aria-label="Seven-day load index sample bars">
                {trend.map((value, index) => (
                  <div key={`${value}-${index}`} className="flex flex-1 flex-col items-center gap-2">
                    <div className="w-full rounded-t-2xl bg-(--accent)" style={{ height: `${value * 3}px` }} />
                    <span className="text-[0.65rem] text-(--ink-muted)">D{index + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
