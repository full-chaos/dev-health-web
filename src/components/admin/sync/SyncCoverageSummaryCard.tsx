import type { ReactNode } from "react";
import Link from "next/link";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { DataState } from "@/components/ui/DataState";
import { formatNumber } from "@/lib/formatters";
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

export function SyncCoverageSummaryCard({
    configId,
    coverage,
    error,
    isActive,
}: SyncCoverageSummaryCardProps) {
    const editHref = `/org/admin/sync/${configId}/edit`;
    const backfillHref = `${editHref}#backfill`;

    if (error) {
        return (
            <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                <DataState
                    variant="error"
                    title="Coverage summary unavailable"
                    message={error}
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
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href={backfillHref}
                        className="rounded-md border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm font-medium text-foreground hover:border-(--accent) hover:text-(--accent)"
                    >
                        {CTA_LABELS.backfill}
                    </Link>
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
