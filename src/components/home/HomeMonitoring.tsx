"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import type { TabIdOf } from "@/lib/navigation/tabs";
import { METRIC_TABS } from "@/lib/metrics/metricTabs";
import type { MetricFilter } from "@/lib/filters/types";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { getMetricLabel, metricInverseGood } from "@/lib/metrics/catalog";
import type { HomeResponse } from "@/lib/types";

export type MonitoringView = TabIdOf<"metrics">;

/** The three metric groups (approved prototype `.segments`, `app.js:100`; group rows from `flow()`). */
const MONITORING_VIEWS: ReadonlyArray<{ id: MonitoringView; label: string; href: string }> = [
    { id: "flow", label: "Flow", href: "/metrics?tab=flow" },
    { id: "throughput", label: "Throughput", href: "/metrics?tab=throughput" },
    { id: "dora", label: "DORA", href: "/metrics?tab=dora" },
];

/** Search parameter that keeps the selected group across a reload. */
export const MONITORING_PARAM = "monitoring";

export const DEFAULT_MONITORING_VIEW: MonitoringView = "flow";

export function parseMonitoringView(value: unknown): MonitoringView | null {
    return MONITORING_VIEWS.some((view) => view.id === value) ? (value as MonitoringView) : null;
}

// Order of the three views by lens, as the page had it before (surface priority of the lens).
const VIEW_PRIORITY: Record<string, readonly string[]> = {
    ic: ["flow", "throughput", "dora"],
    em: ["flow", "throughput", "dora"],
    pm: ["flow", "throughput", "dora"],
    leadership: ["throughput", "dora", "flow"],
    neutral: ["flow", "throughput", "dora"],
};

/**
 * The tiles of each group, in the approved order: the same rows as the `/metrics` tab of that name
 * (one source, `metricTabs.ts`; prototype `flow(tab)`). Each is one served `HomeResponse.deltas` entry.
 */
function tabMetrics(id: MonitoringView): readonly string[] {
    const tab = METRIC_TABS.find((item) => item.id === id);
    // Loud, never an empty group: a renamed or removed tab must not pass unseen.
    if (!tab) throw new Error(`Monitoring group "${id}" has no Metrics tab`);
    return tab.metrics;
}

// Three typed keys: a tab id added to or removed from `MonitoringView` is a compile error here.
export const MONITORING_GROUP_METRICS: Record<MonitoringView, readonly string[]> = {
    flow: tabMetrics("flow"),
    throughput: tabMetrics("throughput"),
    dora: tabMetrics("dora"),
};

/** Tile note (approved prototype `M.*.note`). The change compares with the window before. */
export const MONITORING_TILE_NOTE = "vs previous window";

type HomeMonitoringProps = {
    home: HomeResponse | null;
    filters: MetricFilter;
    /** The lens role, kept on every link. */
    activeRole: string;
    /** The active lens id; it sets the order of the three views. */
    lensId: string;
    /** The group in the URL (`?monitoring=`), when it names one. */
    initialView?: string | null;
};

/**
 * "Monitoring" block of Home (approved prototype `cockpit()`, `app.js:100`): a toggle between the
 * Flow, Throughput and DORA groups, then that group's metric tiles in one joined strip.
 *
 * The toggle switches the group in place and never navigates (CHAOS-8433); the choice is kept in the
 * `monitoring` search parameter so a reload keeps it. "Jump to full diagnostic views" is the link to
 * the page of the chosen group.
 *
 * Each tile is one served `HomeResponse.deltas` entry, found by its metric key: label, value,
 * unit, change and sparkline as served. A metric the API did not serve reads "Not reported"; the
 * web makes no value. A tile links to the evidence page of its metric.
 */
export function HomeMonitoring({
    home,
    filters,
    activeRole,
    lensId,
    initialView,
}: HomeMonitoringProps) {
    const priority = VIEW_PRIORITY[lensId] ?? VIEW_PRIORITY.neutral;
    const views = [...MONITORING_VIEWS].sort(
        (a, b) => priority.indexOf(a.id) - priority.indexOf(b.id),
    );
    const [view, setView] = useState<MonitoringView>(
        parseMonitoringView(initialView) ?? DEFAULT_MONITORING_VIEW,
    );
    const selectView = (next: MonitoringView) => {
        setView(next);
        // Keep the choice in the address without a navigation (no route change, no server round trip).
        try {
            const url = new URL(window.location.href);
            url.searchParams.set(MONITORING_PARAM, next);
            // Null state: Next treats a call that carries its own history state as its own and skips
            // the router sync, so the scope bar would not see this parameter.
            window.history.replaceState(null, "", url);
        } catch {
            // The address is a convenience; the toggle works without it.
        }
    };
    const current = MONITORING_VIEWS.find((item) => item.id === view) ?? MONITORING_VIEWS[0];

    const deltas = home?.deltas ?? [];
    // "No source connected" and "sources present, nothing computed" are different states.
    const hasSources = Object.keys(home?.freshness?.sources ?? {}).length > 0;
    const metrics = MONITORING_GROUP_METRICS[view];

    return (
        <Section title="Monitoring" data-testid="home-monitoring">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <SegmentedControl
                    ariaLabel="Monitoring views"
                    testId="monitoring-segments"
                    options={views.map(({ id, label }) => ({ id, label }))}
                    value={view}
                    onChange={selectView}
                />
                <Link
                    href={withFilterParam(current.href, filters, activeRole)}
                    data-testid="monitoring-jump"
                    className="inline-flex items-center gap-1 text-xs text-(--accent-2) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
                >
                    {CTA_LABELS.jumpToDiagnosticViews}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
            </div>

            <div className="mt-4">
                {deltas.length === 0 ? (
                    <DataState
                        variant={hasSources ? "detector-enabled-no-findings" : "no-data-connected"}
                    />
                ) : (
                    <MetricStrip data-testid="monitoring-tiles">
                        {metrics.map((metric) => {
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
                            if (delta.has_data === false) {
                                return (
                                    <MetricCard
                                        key={metric}
                                        testId={`monitoring-tile-${metric}`}
                                        label={delta.label}
                                        valueText="No data for this window"
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
                                    delta={
                                        delta.has_prior_data === false ? undefined : delta.delta_pct
                                    }
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
