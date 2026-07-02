"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSyncJobs } from "@/lib/admin/server";
import type { SyncJob } from "@/lib/admin/types";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatDateUTC, formatNumber } from "@/lib/formatters";
import { SyncStatusBadge } from "./SyncStatusBadge";
import {
    CoverageBadge,
    jobCoverageLabel,
    jobCoverageTone,
    type JobCoverageResult,
} from "./CoverageBadge";

const PAGE_SIZE = 10;

interface SyncJobHistoryProps {
    jobs: SyncJob[];
    configId: string;
    /**
     * When true, paginate purely client-side over the full `jobs` array
     * instead of calling the `getSyncJobs` server action (test-mode / sample
     * data rendering — mirrors SyncRunDetailLive's `testMode` convention).
     */
    testMode?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Locked UTC-anchored formatter: bare toLocaleString() drifts between Node
// and browser locales/timezones (hydration + CI mismatches). Module-level
// so we don't allocate a new Intl.DateTimeFormat per render.
const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
});

function formatTimestamp(value: string | null | undefined): string {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return TIMESTAMP_FORMATTER.format(date);
}

function formatRange(range: { since: string; before: string } | null | undefined): string {
    if (!range) return "—";
    return `${formatDateUTC(range.since)} → ${formatDateUTC(range.before)}`;
}

function getDuration(job: SyncJob): string {
    if (job.duration_seconds != null) return `${Math.round(job.duration_seconds)}s`;
    if (job.completed_at && job.started_at) {
        return `${Math.round(
            (new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000,
        )}s`;
    }
    return "—";
}

function getBadgeStatus(status: SyncJob["status"]) {
    switch (status) {
        case "success":
            return "success" as const;
        case "failed":
        case "cancelled":
            return "failed" as const;
        case "running":
            return "running" as const;
        case "pending":
            return "idle" as const;
        default:
            return "never" as const;
    }
}

function getBadgeLabel(status: SyncJob["status"]) {
    switch (status) {
        case "pending":
            return "Queued";
        case "cancelled":
            return "Cancelled";
        default:
            return undefined;
    }
}

/**
 * Derive the coverage-result label for a planner-backed job (CHAOS-2792),
 * using ONLY persisted job status + sync_run unit counts. Never re-derives
 * from range/interval comparisons (platform ban on client-side coverage math).
 * Returns null for non-terminal jobs or legacy rows (no sync_run block) —
 * those render the plain job status badge instead.
 */
function deriveJobCoverageResult(job: SyncJob): JobCoverageResult | null {
    const sr = job.sync_run;
    if (!sr) return null;
    if (job.status === "pending" || job.status === "running") return null;

    const settled = sr.completed_units + sr.failed_units;

    if (job.status === "failed" || job.status === "cancelled") {
        return sr.completed_units === 0 ? "failed" : "partial";
    }
    // job.status === "success"
    if (sr.total_units === 0) return "complete";
    if (sr.failed_units > 0 && sr.completed_units > 0) return "partial";
    if (sr.failed_units > 0 && sr.completed_units === 0) return "failed";
    if (settled < sr.total_units) return "gap";
    return "complete";
}

function getRunId(job: SyncJob): string | null {
    if (job.sync_run?.sync_run_id) return job.sync_run.sync_run_id;
    if (isRecord(job.result) && typeof job.result.sync_run_id === "string") {
        return job.result.sync_run_id;
    }
    return null;
}

function getScopeLabel(job: SyncJob): string {
    const sr = job.sync_run;
    if (!sr) {
        const datasetKey = isRecord(job.result) && typeof job.result.dataset_key === "string"
            ? job.result.dataset_key
            : null;
        return datasetKey ?? "—";
    }
    const sourceIds = new Set<string>([
        ...(sr.requested_range?.source_ids ?? []),
        ...(sr.covered_range?.source_ids ?? []),
    ]);
    if (sourceIds.size === 0) return "—";
    return `${formatNumber(sourceIds.size)} source${sourceIds.size === 1 ? "" : "s"}`;
}

const HEADINGS = [
    "Trigger",
    "Mode",
    "Requested range",
    "Covered range",
    "Status",
    "Scope",
    "Units",
    "Started",
    "Duration",
    "Actions",
];

export function SyncJobHistory({ jobs, configId, testMode = false }: SyncJobHistoryProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [offset, setOffset] = useState(0);
    // Fetched-page state is used ONLY for offset > 0 (server-backed mode).
    // The offset-0 page is derived reactively from `jobs` below (see
    // firstPageJobs) so a Sync Now / Backfill refresh — router.refresh()
    // delivering a fresh `jobs` prop — is reflected immediately, without
    // requiring a pagination click (regression: CHAOS-2791).
    const [fetchedPageJobs, setFetchedPageJobs] = useState<SyncJob[]>([]);
    const [fetchedHasMore, setFetchedHasMore] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const clientPageJobs = useMemo(() => jobs.slice(offset, offset + PAGE_SIZE), [jobs, offset]);

    const firstPageJobs = useMemo(() => jobs.slice(0, PAGE_SIZE), [jobs]);
    const firstPageHasMore = jobs.length > PAGE_SIZE;

    const visibleJobs = testMode ? clientPageJobs : offset === 0 ? firstPageJobs : fetchedPageJobs;
    const hasMore = offset === 0 ? firstPageHasMore : fetchedHasMore;

    if (jobs.length === 0) {
        return (
            <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-8 text-center">
                <p className="text-sm text-(--ink-muted)">No sync history available.</p>
            </div>
        );
    }

    const goToOffset = (nextOffset: number) => {
        const safeOffset = Math.max(0, nextOffset);
        if (testMode) {
            setOffset(safeOffset);
            return;
        }
        setFetchError(null);
        if (safeOffset === 0) {
            // No fetch needed — the offset-0 page always derives from the
            // current `jobs` prop (see firstPageJobs above).
            setOffset(0);
            return;
        }
        startTransition(async () => {
            const result = await getSyncJobs(configId, PAGE_SIZE + 1, safeOffset);
            if (result.error || !result.data) {
                setFetchError(result.error ?? "Failed to load more jobs.");
                return;
            }
            setOffset(safeOffset);
            setFetchedPageJobs(result.data.slice(0, PAGE_SIZE));
            setFetchedHasMore(result.data.length > PAGE_SIZE);
        });
    };

    const canGoPrevious = offset > 0;
    const canGoNext = testMode ? offset + PAGE_SIZE < jobs.length : hasMore;

    return (
        <div className="overflow-x-auto rounded-xl border border-(--card-stroke) bg-(--card-80)">
            {fetchError && (
                <div
                    role="alert"
                    className="border-b border-(--card-stroke) px-6 py-3 text-sm text-(--negative)"
                >
                    {fetchError}
                </div>
            )}
            <table className="min-w-full divide-y divide-(--card-stroke)">
                <thead className="bg-(--card-bg)">
                    <tr>
                        {HEADINGS.map((heading) => (
                            <th
                                key={heading}
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider"
                            >
                                {heading}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-(--card-stroke) bg-(--card-80)">
                    {visibleJobs.map((job) => {
                        const runId = getRunId(job);
                        const href = runId ? `/org/admin/sync/${configId}/runs/${runId}` : null;
                        const coverageResult = deriveJobCoverageResult(job);
                        const sr = job.sync_run;

                        return (
                            <tr
                                key={job.id}
                                onClick={href ? () => router.push(href) : undefined}
                                className={
                                    href
                                        ? "cursor-pointer transition-colors hover:bg-(--card-70)"
                                        : undefined
                                }
                            >
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground">
                                    {sr?.triggered_by ?? job.triggered_by ?? "—"}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-(--ink-muted)">
                                    {sr?.mode ?? "—"}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-(--ink-muted)">
                                    {formatRange(sr?.requested_range)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-(--ink-muted)">
                                    {formatRange(sr?.covered_range)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    {coverageResult ? (
                                        <CoverageBadge
                                            tone={jobCoverageTone(coverageResult)}
                                            label={jobCoverageLabel(coverageResult)}
                                        />
                                    ) : (
                                        <SyncStatusBadge
                                            status={getBadgeStatus(job.status)}
                                            label={getBadgeLabel(job.status)}
                                        />
                                    )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-(--ink-muted)">
                                    {getScopeLabel(job)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-(--ink-muted)">
                                    {sr
                                        ? `${formatNumber(sr.completed_units)} done · ${formatNumber(sr.failed_units)} failed · ${formatNumber(sr.total_units)} total`
                                        : (job.items_synced ?? "—")}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground">
                                    {formatTimestamp(job.started_at)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-(--ink-muted)">
                                    {getDuration(job)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm">
                                    {href ? (
                                        <Link
                                            href={href}
                                            aria-label={`View run details for sync run started ${formatTimestamp(
                                                job.started_at,
                                            )}`}
                                            className="text-(--accent) hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                                        >
                                            {CTA_LABELS.viewRun}
                                        </Link>
                                    ) : (
                                        <span className="text-(--ink-muted)">—</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <div className="flex items-center justify-between border-t border-(--card-stroke) px-6 py-4">
                <span className="text-sm text-(--ink-muted)">
                    Showing {offset + 1}-{offset + visibleJobs.length}
                    {isPending ? " · Loading…" : ""}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => goToOffset(offset - PAGE_SIZE)}
                        disabled={!canGoPrevious || isPending}
                        className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium hover:bg-(--card-70) disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {CTA_LABELS.previousPage}
                    </button>
                    <button
                        type="button"
                        onClick={() => goToOffset(offset + PAGE_SIZE)}
                        disabled={!canGoNext || isPending}
                        className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium hover:bg-(--card-70) disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {CTA_LABELS.nextPage}
                    </button>
                </div>
            </div>
        </div>
    );
}
