"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { DataState } from "@/components/ui/DataState";
import { formatDateUTC, formatNumber } from "@/lib/formatters";
import { CTA_LABELS } from "@/lib/design/cta";
import type { SyncCoverageSummary } from "@/lib/admin/types";
import { CoverageBadge, healthLabel, healthTone } from "./CoverageBadge";
import { SyncNowButton } from "./SyncNowButton";

interface SyncCoverageSummaryCardProps {
    configId: string;
    /** Null while the coverage summary is loading (page.tsx fetches synchronously; kept for reuse). */
    coverage: SyncCoverageSummary | null;
    /** UI-safe error message when the coverage fetch failed (never a raw exception). */
    error?: string | null;
    isActive: boolean;
    /** Opens the backfill wizard in place on the detail page (CHAOS-2795). */
    onBackfillAction: () => void;
}

function StatBlock({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div>
            <dt className="text-xs font-medium text-(--ink-muted) uppercase tracking-wider">
                {label}
            </dt>
            <dd className="mt-1 text-lg font-medium text-foreground">{value}</dd>
        </div>
    );
}

function truncationMessage(reason: string | null | undefined): string {
    if (reason === "lookback_limit") {
        return "History is limited to this coverage window so coverage can be computed safely. Older activity may not appear in the health summary or timeline.";
    }
    return "History is limited to this coverage window. Older activity may not appear in the health summary or timeline.";
}

export function SyncCoverageSummaryCard({
    configId,
    coverage,
    error,
    isActive,
    onBackfillAction,
}: SyncCoverageSummaryCardProps) {
    const router = useRouter();
    const editHref = `/org/admin/sync/${configId}/edit`;

    if (error) {
        return (
            <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                <DataState
                    variant="error"
                    title="Coverage summary unavailable"
                    message={error}
                    action={
                        <div className="flex flex-wrap items-center justify-center gap-3">
                            <button
                                type="button"
                                onClick={onBackfillAction}
                                className="rounded-md border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm font-medium text-foreground hover:border-(--accent) hover:text-(--accent)"
                            >
                                {CTA_LABELS.backfill}
                            </button>
                            <button
                                type="button"
                                onClick={() => router.refresh()}
                                className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                            >
                                {CTA_LABELS.retry}
                            </button>
                        </div>
                    }
                    data-testid="coverage-summary-error"
                />
            </div>
        );
    }

    if (!coverage) {
        return (
            <div
                className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6"
                data-testid="coverage-summary-loading"
            >
                <DataState variant="loading" title="Loading coverage summary…" />
            </div>
        );
    }

    const { overall, data_basis: dataBasis } = coverage;
    const coveredRanges = coverage.datasets.flatMap((dataset) => dataset.covered_ranges);
    const derivedSince = coveredRanges
        .map((range) => new Date(range.since).getTime())
        .filter(Number.isFinite)
        .reduce<number | null>((earliest, value) => Math.min(earliest ?? value, value), null);
    const derivedThrough = coveredRanges
        .map((range) => new Date(range.before).getTime())
        .filter(Number.isFinite)
        .reduce<number | null>((latest, value) => Math.max(latest ?? value, value), null);
    const coverageSince =
        coverage.coverage_since ??
        (derivedSince === null ? null : new Date(derivedSince).toISOString());
    const coverageThrough =
        coverage.coverage_through ??
        (derivedThrough === null ? null : new Date(derivedThrough).toISOString());
    const hasCoverageWindow = coverageSince !== null && coverageThrough !== null;
    const isLegacyInsufficientData =
        overall.health === "insufficient_data" && dataBasis === "legacy";

    return (
        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <CoverageBadge
                            tone={healthTone(overall.health)}
                            label={healthLabel(overall.health)}
                            className="text-sm px-3 py-1"
                        />
                        <span className="text-sm text-(--ink-muted)">
                            {isActive ? "Active" : "Inactive"}
                        </span>
                    </div>
                    {isLegacyInsufficientData && (
                        <p
                            className="max-w-xl text-sm text-(--ink-muted)"
                            data-testid="coverage-legacy-notice"
                        >
                            This configuration has no planner-tracked sync runs yet, so detailed
                            coverage cannot be computed. Coverage will populate once a
                            planner-backed sync completes.
                        </p>
                    )}
                    <p className="text-sm text-(--ink-muted)" data-testid="coverage-window">
                        {hasCoverageWindow ? (
                            <>
                                Coverage shown: {formatDateUTC(coverageSince)} –{" "}
                                {formatDateUTC(coverageThrough)}
                            </>
                        ) : (
                            "No successful synced data yet."
                        )}
                    </p>
                    {coverage.is_truncated === true && (
                        <p
                            className="max-w-2xl rounded-lg border border-(--caution)/40 bg-(--caution)/10 px-3 py-2 text-sm text-foreground"
                            data-testid="coverage-truncation-notice"
                        >
                            {truncationMessage(coverage.truncation_reason)}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onBackfillAction}
                        className="rounded-md border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm font-medium text-foreground hover:border-(--accent) hover:text-(--accent)"
                    >
                        {CTA_LABELS.backfill}
                    </button>
                    <Link
                        href={editHref}
                        className="rounded-md border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm font-medium text-foreground hover:border-(--accent) hover:text-(--accent)"
                    >
                        {CTA_LABELS.editConfig}
                    </Link>
                    <SyncNowButton configId={configId} />
                </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
                <StatBlock
                    label="Last successful run"
                    value={
                        <ClientTimestamp
                            value={overall.latest_successful_run_at}
                            fallback="Never"
                        />
                    }
                />
                <StatBlock
                    label="Next scheduled run"
                    value={
                        <ClientTimestamp
                            value={overall.next_scheduled_run_at}
                            fallback="Not scheduled"
                        />
                    }
                />
                <StatBlock
                    label="Covered through"
                    value={<ClientTimestamp value={overall.latest_covered_through} fallback="—" />}
                />
                <StatBlock label="Gaps" value={formatNumber(overall.gap_count)} />
                <StatBlock
                    label="Stale datasets"
                    value={formatNumber(overall.stale_dataset_count)}
                />
                <StatBlock label="Failed ranges" value={formatNumber(overall.failed_range_count)} />
            </dl>
        </div>
    );
}
