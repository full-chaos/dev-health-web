import Link from "next/link";

import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import type { MetricFilter } from "@/lib/filters/types";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { getMetricLabel, metricInverseGood } from "@/lib/metrics/catalog";
import type { HomeResponse } from "@/lib/types";

/** The three full diagnostic views (approved prototype `.segments`, `app.js:100`). */
const MONITORING_VIEWS = [
    { id: "flow", label: "Flow", href: "/metrics?tab=flow" },
    { id: "throughput", label: "Throughput", href: "/metrics?tab=throughput" },
    { id: "dora", label: "DORA", href: "/metrics?tab=dora" },
] as const;

// Order of the three views by lens, as the page had it before (surface priority of the lens).
const VIEW_PRIORITY: Record<string, readonly string[]> = {
    ic: ["flow", "throughput", "dora"],
    em: ["flow", "throughput", "dora"],
    pm: ["flow", "throughput", "dora"],
    leadership: ["throughput", "dora", "flow"],
    neutral: ["flow", "throughput", "dora"],
};

/** The four tiles of the approved Monitoring block, in its order (`app.js:100`, `M.cycle` …). */
export const MONITORING_TILE_METRICS = [
    "cycle_time",
    "review_latency",
    "throughput",
    "wip_saturation",
] as const;

/** Tile note (approved prototype `M.*.note`). The change compares with the window before. */
export const MONITORING_TILE_NOTE = "vs previous window";

type HomeMonitoringProps = {
    home: HomeResponse | null;
    filters: MetricFilter;
    /** The lens role, kept on every link. */
    activeRole: string;
    /** The active lens id; it sets the order of the three view links. */
    lensId: string;
};

/**
 * "Monitoring" block of Home (approved prototype `cockpit()`, `app.js:100`): three segment links
 * that jump to the full diagnostic views, then four metric tiles in one joined strip.
 *
 * Each tile is one served `HomeResponse.deltas` entry, found by its metric key: label, value,
 * unit, change and sparkline as served. A metric the API did not serve reads "Not reported"; the
 * web makes no value. A tile links to the evidence page of its metric.
 */
export function HomeMonitoring({ home, filters, activeRole, lensId }: HomeMonitoringProps) {
    const priority = VIEW_PRIORITY[lensId] ?? VIEW_PRIORITY.neutral;
    const views = [...MONITORING_VIEWS].sort(
        (a, b) => priority.indexOf(a.id) - priority.indexOf(b.id),
    );

    const deltas = home?.deltas ?? [];
    // "No source connected" and "sources present, nothing computed" are different states.
    const hasSources = Object.keys(home?.freshness?.sources ?? {}).length > 0;

    return (
        <Section title="Monitoring" data-testid="home-monitoring">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <nav
                    aria-label="Monitoring views"
                    data-testid="monitoring-segments"
                    className="inline-flex gap-0.75 rounded-(--radius-sm) bg-background p-0.75"
                >
                    {views.map((view) => (
                        <Link
                            key={view.id}
                            href={withFilterParam(view.href, filters, activeRole)}
                            data-view={view.id}
                            className="rounded-sm px-2.25 py-1.25 text-xs text-(--ink-muted) transition-colors hover:bg-(--card) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
                        >
                            {view.label}
                        </Link>
                    ))}
                </nav>
                <span className="text-xs text-(--ink-muted)">Jump to full diagnostic views</span>
            </div>

            <div className="mt-4">
                {deltas.length === 0 ? (
                    <DataState
                        variant={hasSources ? "detector-enabled-no-findings" : "no-data-connected"}
                    />
                ) : (
                    <MetricStrip data-testid="monitoring-tiles">
                        {MONITORING_TILE_METRICS.map((metric) => {
                            const delta = deltas.find((item) => item.metric === metric);
                            if (!delta) {
                                return (
                                    <MetricCard
                                        key={metric}
                                        testId={`monitoring-tile-${metric}`}
                                        label={getMetricLabel(metric)}
                                        valueText={NOT_REPORTED}
                                        // No change and no trend for a metric that was not served.
                                        deltaSlot={<></>}
                                        hideTrend
                                    />
                                );
                            }
                            return (
                                <MetricCard
                                    key={metric}
                                    testId={`monitoring-tile-${metric}`}
                                    label={delta.label}
                                    href={buildExploreUrl({ metric, filters, role: activeRole })}
                                    value={delta.value}
                                    unit={delta.unit}
                                    delta={delta.delta_pct}
                                    inverseGood={metricInverseGood(metric)}
                                    spark={delta.spark}
                                    caption={MONITORING_TILE_NOTE}
                                />
                            );
                        })}
                    </MetricStrip>
                )}
            </div>
        </Section>
    );
}
