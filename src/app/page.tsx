import Link from "next/link";

import { InvestmentPreview } from "@/components/home/InvestmentPreview";
import { DataStatusBanner } from "@/components/home/DataStatusBanner";
import { getHomeData } from "@/lib/api";
import { formatDelta, formatMetricValue, formatPercent, formatTimestamp } from "@/lib/formatters";
import type { HomeResponse } from "@/lib/types";

const deltaAccent = (value: number) =>
  value > 0 ? "text-rose-600" : value < 0 ? "text-emerald-600" : "text-zinc-500";

const loadHome = async (params: {
  scopeType: string;
  scopeId: string;
  rangeDays: number;
  compareDays: number;
}): Promise<HomeResponse | null> => {
  try {
    return await getHomeData(params);
  } catch {
    return null;
  }
};

const fallbackDeltas = [
  { metric: "cycle_time", label: "Cycle Time", value: 0, unit: "days", delta_pct: 0 },
  { metric: "review_latency", label: "Review Latency", value: 0, unit: "hours", delta_pct: 0 },
  { metric: "throughput", label: "Throughput", value: 0, unit: "items", delta_pct: 0 },
  { metric: "deploy_freq", label: "Deploy Frequency", value: 0, unit: "deploys", delta_pct: 0 },
  { metric: "churn", label: "Code Churn", value: 0, unit: "loc", delta_pct: 0 },
  { metric: "wip_saturation", label: "WIP Saturation", value: 0, unit: "%", delta_pct: 0 },
  { metric: "blocked_work", label: "Blocked Work", value: 0, unit: "hours", delta_pct: 0 },
  { metric: "change_failure_rate", label: "Change Failure Rate", value: 0, unit: "%", delta_pct: 0 },
];

type HomePageProps = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

export default async function Home({ searchParams }: HomePageProps) {
  const scopeType = (searchParams?.scope_type as string) ?? "org";
  const scopeId = (searchParams?.scope_id as string) ?? "";
  const rangeDays = Number(searchParams?.range_days ?? 14);
  const compareDays = Number(searchParams?.compare_days ?? 14);

  const home = await loadHome({ scopeType, scopeId, rangeDays, compareDays });
  const coverage = home?.freshness.coverage;
  const coverageLow = coverage ? coverage.repos_covered_pct < 70 : false;
  const lastIngestedAt = home?.freshness.last_ingested_at ?? null;
  const deltas = home?.deltas?.length ? home.deltas : fallbackDeltas;
  const placeholderDeltas = !home?.deltas?.length;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7e8_0%,_#f7f1e6_38%,_#efe6d6_100%)] text-[var(--foreground)]">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-12">
        <header className="rounded-[32px] border border-[var(--card-stroke)] bg-[var(--card)]/80 p-6 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.4)]">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">
                  Dev Health Ops
                </p>
                <h1 className="mt-3 font-[var(--font-display)] text-3xl leading-tight sm:text-4xl">
                  Developer Health Control Room
                </h1>
                <p className="mt-3 max-w-xl text-sm text-[var(--ink-muted)]">
                  Fast signal on flow, risk, and investment. Every claim drills
                  into evidence.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-[var(--card-stroke)] bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]">
                  {scopeType} scope
                </div>
                <div className="rounded-full border border-[var(--card-stroke)] bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]">
                  {rangeDays}d view
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
              <div className="rounded-3xl border border-dashed border-[var(--card-stroke)] bg-white/70 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[var(--ink-muted)]">
                    Freshness: {formatTimestamp(lastIngestedAt)}
                  </span>
                  <span className="rounded-full bg-[var(--accent-3)]/40 px-3 py-1 text-xs font-semibold">
                    Live analytics
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[var(--ink-muted)]">
                  {home?.freshness.sources ? (
                    Object.entries(home.freshness.sources).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-2xl bg-white/70 px-3 py-2"
                      >
                        <span className="uppercase tracking-[0.2em]">{key}</span>
                        <span className="font-semibold text-[var(--foreground)]">
                          {value}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-2 rounded-2xl border border-dashed border-[var(--card-stroke)] bg-white/60 px-3 py-2">
                      Source signals pending.
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--accent-2)]/10 p-4 text-xs text-[var(--ink-muted)]">
                <p className="text-[var(--accent-2)]/90">Coverage</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                  {coverage ? formatPercent(coverage.repos_covered_pct) : "--"}
                </p>
                <p className="mt-2">
                  PR ↔ Issue links: {coverage ? formatPercent(coverage.prs_linked_to_issues_pct) : "--"}
                </p>
                <p>Cycle states: {coverage ? formatPercent(coverage.issues_with_cycle_states_pct) : "--"}</p>
              </div>
            </div>
          </div>
        </header>

        <DataStatusBanner
          isUnavailable={!home}
          lastIngestedAt={lastIngestedAt}
          coverageLow={coverageLow}
        />

        <section className="grid gap-4 md:grid-cols-4">
          {deltas.map((delta) => (
            <Link
              key={delta.metric}
              href={`/explore?metric=${delta.metric}`}
              data-testid="delta-tile"
              className="group rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-4 transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                <span>{delta.label}</span>
                <span className={deltaAccent(delta.delta_pct)}>
                  {formatDelta(delta.delta_pct)}
                </span>
              </div>
              <p className="mt-4 text-2xl font-semibold">
                {placeholderDeltas ? "--" : formatMetricValue(delta.value, delta.unit)}
              </p>
              <p className="mt-3 text-xs text-[var(--ink-muted)]">
                Tap for evidence
              </p>
            </Link>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-[var(--card-stroke)] bg-white/80 p-6">
            <h2 className="font-[var(--font-display)] text-2xl">System Summary</h2>
            <div className="mt-4 space-y-3 text-sm text-[var(--ink-muted)]">
              {(home?.summary ?? []).map((sentence) => (
                <Link
                  key={sentence.id}
                  href={sentence.evidence_link}
                  className="block rounded-2xl border border-transparent bg-white/60 px-4 py-3 transition hover:border-[var(--card-stroke)]"
                >
                  {sentence.text}
                </Link>
              ))}
              {!home?.summary?.length && (
                <p className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-white/60 px-4 py-3">
                  Summary will appear once data is ingested.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {home?.tiles
                ? Object.entries(home.tiles).map(([key, tile]) => (
                    <Link
                      key={key}
                      href={tile.link}
                      className="group rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-4 transition hover:-translate-y-1"
                    >
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                        {tile.title}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">
                        {tile.subtitle}
                      </p>
                      <p className="mt-3 text-xs text-[var(--ink-muted)]">
                        Evidence →
                      </p>
                    </Link>
                  ))
                : null}
            </div>
            <Link
              href="/opportunities"
              className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--accent)]/15 p-4"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                Execute Focus
              </p>
              <p className="mt-2 text-base font-semibold">
                {home?.constraint.title ?? "Constraint pending"}
              </p>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                {home?.constraint.claim ?? "Capture the limiting factor."}
              </p>
            </Link>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-[var(--font-display)] text-xl">Constraint Evidence</h3>
              <Link href="/explore?metric=review_latency" className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]">
                Drilldown
              </Link>
            </div>
            <p className="mt-3 text-sm text-[var(--ink-muted)]">
              {home?.constraint.claim ?? "Evidence will appear once data is ingested."}
            </p>
            <div className="mt-4 space-y-3 text-sm">
              {(home?.constraint.evidence ?? []).map((item, idx) => (
                <Link
                  key={`${item.label}-${idx}`}
                  href={item.link}
                  className="block rounded-2xl border border-[var(--card-stroke)] bg-white/70 px-4 py-3"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--ink-muted)]">
              {(home?.constraint.experiments ?? []).map((experiment) => (
                <span
                  key={experiment}
                  className="rounded-full border border-[var(--card-stroke)] bg-white/70 px-3 py-1"
                >
                  {experiment}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--card-stroke)] bg-white/80 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-[var(--font-display)] text-xl">Events</h3>
              <Link href="/explore" className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]">
                Explore
              </Link>
            </div>
            <div className="mt-4 space-y-4 text-sm">
              {(home?.events ?? []).map((event, idx) => (
                <Link
                  key={`${event.type}-${idx}`}
                  href={event.link}
                  className="block rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                    <span>{event.type}</span>
                    <span>{formatTimestamp(event.ts)}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--foreground)]">
                    {event.text}
                  </p>
                </Link>
              ))}
              {!home?.events?.length && (
                <p className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3 text-[var(--ink-muted)]">
                  No major shifts detected in the current window.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h3 className="font-[var(--font-display)] text-xl">Investment Mix</h3>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Live work allocation preview, refreshed client-side.
            </p>
            <Link
              href="/investment"
              className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
            >
              View investment →
            </Link>
          </div>
          <InvestmentPreview />
        </section>
      </main>
    </div>
  );
}
