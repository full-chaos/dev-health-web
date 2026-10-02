"use client";

import { useSecurityOverview } from "@/lib/graphql/hooks/useSecurity";
import type { SecurityFilter } from "@/lib/filters/security";
import { SECURITY_KPI_LABELS } from "@/lib/security/kpiLabels";
import { SeverityStackedBar } from "./SeverityStackedBar";
import { TopReposChart } from "./TopReposChart";
import { TrendChart } from "./TrendChart";
import { OctagonAlert, TriangleAlert } from "lucide-react";

import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { STATUS_PILL } from "@/lib/statusPill";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { DataState } from "@/components/ui/DataState";
import type { SeverityBucketData, RepoAlertCountData, TrendPointData } from "./types";

interface SecurityDashboardProps {
    filter: SecurityFilter;
}

/** Thin inline error placeholder rendered inside each testid wrapper in degraded mode. */
function DegradedTile({ label }: { label: string }) {
    return (
        <DataState
            variant="error"
            title={`${label} unavailable`}
            message="This security view could not be loaded. Please retry."
        />
    );
}

/**
 * The 30-day change of the open-alert COUNT, as the tile always showed it: "↑ +n", "↓ -n" or
 * "· no change". A count change, not a percent (so not `MetricDelta`).
 */
function CountDelta({ delta }: { delta: number }) {
    if (delta === 0) {
        return <span className="text-xs text-(--ink-muted)">· no change</span>;
    }
    if (delta > 0) {
        return <span className="text-xs text-(--negative)">↑ +{delta}</span>;
    }
    return <span className="text-xs text-(--positive)">↓ {delta}</span>;
}

const PILL_ICON = { negative: OctagonAlert, caution: TriangleAlert } as const;

/**
 * The strip draws the seams and the outer border; a tile inside its testid wrapper (kept for the
 * e2e tests) drops its own border and radius, as the strip does for its direct children.
 */
const IN_STRIP = "h-full rounded-none! border-0!";

/** A severity pill on the tile: icon + word, so color is never the only signal (MAPPING S4). */
function SeverityPill({ label, tone }: { label: string; tone: "negative" | "caution" }) {
    const Icon = PILL_ICON[tone];
    return (
        <span
            data-testid="kpi-pill"
            data-tone={tone}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_PILL[tone]}`}
        >
            <Icon aria-hidden="true" className="h-3 w-3" />
            {label}
        </span>
    );
}

/** A KPI slot while the overview loads: the shared loading block, never a value. */
function LoadingTile({ label }: { label: string }) {
    return <DataState variant="loading" title={`${label} loading`} className="bg-card p-4" />;
}

export function SecurityDashboard({ filter }: SecurityDashboardProps) {
    const { data, fetching, error } = useSecurityOverview(filter);

    const kpis = data?.securityOverview?.kpis;
    const severityBreakdown = data?.securityOverview?.severityBreakdown ?? [];
    const topRepos = data?.securityOverview?.topRepos ?? [];
    const trend = data?.securityOverview?.trend ?? [];

    // Cast to narrowed types expected by chart components
    const buckets = severityBreakdown as SeverityBucketData[];
    const repos = topRepos as RepoAlertCountData[];
    const trendPoints = trend as TrendPointData[];

    const mttfValue =
        kpis?.meanDaysToFix30d != null ? `${kpis.meanDaysToFix30d.toFixed(1)}d` : "No data";

    return (
        <div className="flex flex-col gap-6">
            {/* Banner-level error notice — does NOT replace the grid structure */}
            {error && (
                <ErrorCard title="Failed to load security overview" message={error.message} />
            )}

            {/* Row 1: KPI tiles in the shared metric strip (the one metric tile, MAPPING S3-S5).
                The testid wrappers are always in the DOM (required by Playwright). */}
            <MetricStrip columns={4} data-testid="security-kpi-strip">
                <div data-testid="kpi-open" className="bg-card">
                    {error ? (
                        <DegradedTile label={SECURITY_KPI_LABELS.open} />
                    ) : fetching ? (
                        <LoadingTile label={SECURITY_KPI_LABELS.open} />
                    ) : (
                        <MetricCard
                            label={SECURITY_KPI_LABELS.open}
                            value={kpis?.openTotal ?? 0}
                            deltaSlot={
                                kpis?.openDelta30d !== undefined && kpis?.openDelta30d !== null ? (
                                    <CountDelta delta={kpis.openDelta30d} />
                                ) : (
                                    false
                                )
                            }
                            hideTrend
                            className={IN_STRIP}
                        />
                    )}
                </div>
                <div data-testid="kpi-critical" className="bg-card">
                    {error ? (
                        <DegradedTile label={SECURITY_KPI_LABELS.critical} />
                    ) : fetching ? (
                        <LoadingTile label={SECURITY_KPI_LABELS.critical} />
                    ) : (
                        <MetricCard
                            label={SECURITY_KPI_LABELS.critical}
                            value={kpis?.critical ?? 0}
                            deltaSlot={
                                kpis && kpis.critical > 0 ? (
                                    <SeverityPill label="Critical" tone="negative" />
                                ) : (
                                    false
                                )
                            }
                            hideTrend
                            className={IN_STRIP}
                        />
                    )}
                </div>
                <div data-testid="kpi-high" className="bg-card">
                    {error ? (
                        <DegradedTile label={SECURITY_KPI_LABELS.high} />
                    ) : fetching ? (
                        <LoadingTile label={SECURITY_KPI_LABELS.high} />
                    ) : (
                        <MetricCard
                            label={SECURITY_KPI_LABELS.high}
                            value={kpis?.high ?? 0}
                            deltaSlot={
                                kpis && kpis.high > 0 ? (
                                    <SeverityPill label="High" tone="caution" />
                                ) : (
                                    false
                                )
                            }
                            hideTrend
                            className={IN_STRIP}
                        />
                    )}
                </div>
                <div data-testid="kpi-mttf" className="bg-card">
                    {error ? (
                        <DegradedTile label="Mean Days to Fix (30d)" />
                    ) : fetching ? (
                        <LoadingTile label="Mean Days to Fix (30d)" />
                    ) : (
                        <MetricCard
                            label="Mean Days to Fix (30d)"
                            valueText={mttfValue}
                            deltaSlot={false}
                            hideTrend
                            className={IN_STRIP}
                        />
                    )}
                </div>
            </MetricStrip>

            {/* Row 2: Severity breakdown + Top repos */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-(--card-stroke) bg-card p-4">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wider text-(--ink-muted)">
                        By Severity
                    </p>
                    {error ? (
                        <DegradedTile label="Severity breakdown" />
                    ) : (
                        <SeverityStackedBar buckets={buckets} loading={fetching} />
                    )}
                </div>
                <div
                    className="rounded-2xl border border-(--card-stroke) bg-card p-4"
                    data-testid="top-repos-chart"
                >
                    <p className="mb-3 text-xs font-medium uppercase tracking-wider text-(--ink-muted)">
                        Top Repos by Alert Count
                    </p>
                    {error ? (
                        <DegradedTile label="Top repos chart" />
                    ) : (
                        <TopReposChart repos={repos} loading={fetching} />
                    )}
                </div>
            </div>

            {/* Row 3: Trend chart */}
            <div className="rounded-2xl border border-(--card-stroke) bg-card p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-(--ink-muted)">
                    Trend (last 30 days)
                </p>
                {error ? (
                    <DegradedTile label="Trend chart" />
                ) : (
                    <TrendChart points={trendPoints} loading={fetching} />
                )}
            </div>
        </div>
    );
}
