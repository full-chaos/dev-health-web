"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SyncJob } from "@/lib/admin/types";
import { CTA_LABELS } from "@/lib/design/cta";
import { SyncStatusBadge } from "./SyncStatusBadge";

interface SyncJobHistoryProps {
    jobs: SyncJob[];
    configId: string;
    totalJobs?: number;
}

export function SyncJobHistory({ jobs, configId, totalJobs }: SyncJobHistoryProps) {
    const router = useRouter();
    const [offset, setOffset] = useState(0);
    const limit = 10;
    const total = totalJobs ?? jobs.length;
    const paginatedJobs = useMemo(() => jobs.slice(offset, offset + limit), [jobs, offset]);

    if (jobs.length === 0) {
        return (
            <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-8 text-center">
                <p className="text-sm text-(--ink-muted)">No sync history available.</p>
            </div>
        );
    }

    const getBadgeStatus = (status: SyncJob["status"]) => {
        switch (status) {
            case "success":
                return "success";
            case "failed":
            case "cancelled":
                return "failed";
            case "running":
                return "running";
            case "pending":
                return "idle";
            default:
                return "never";
        }
    };

    const getBadgeLabel = (status: SyncJob["status"]) => {
        switch (status) {
            case "pending":
                return "Queued";
            case "cancelled":
                return "Cancelled";
            default:
                return undefined;
        }
    };

    const formatTimestamp = (value: string | null | undefined) => {
        if (!value) return "—";
        return new Date(value).toLocaleString();
    };

    const getDuration = (job: SyncJob) => {
        if (job.duration_seconds != null) return `${Math.round(job.duration_seconds)}s`;
        if (job.completed_at && job.started_at) {
            return `${Math.round(
                (new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000,
            )}s`;
        }
        return "-";
    };

    const getActivityLabel = (job: SyncJob) => {
        if (job.status === "cancelled") return "Cancelled";
        if (job.completed_at) return "Completed";
        if (job.status === "running") return "Still running";
        if (job.status === "pending") return "Queued";
        return "Last activity";
    };

    const getActivityTimestamp = (job: SyncJob) =>
        job.completed_at ?? job.started_at ?? job.created_at ?? null;

    const isRecord = (value: unknown): value is Record<string, unknown> =>
        value !== null && typeof value === "object" && !Array.isArray(value);

    const stringifyValue = (value: unknown): string | null => {
        if (typeof value === "string" && value.trim().length > 0) return value;
        if (typeof value === "number" || typeof value === "boolean") return String(value);
        if (Array.isArray(value)) {
            const items = value.map((item) => stringifyValue(item)).filter((item) => item != null);
            return items.length > 0 ? items.join(", ") : null;
        }
        if (isRecord(value)) {
            const entries = Object.entries(value)
                .map(([key, item]) => {
                    const text = stringifyValue(item);
                    return text ? `${key}: ${text}` : null;
                })
                .filter((item) => item != null);
            return entries.length > 0 ? entries.join("; ") : null;
        }
        return null;
    };

    const getResultValue = (result: Record<string, unknown> | null | undefined, key: string) =>
        result ? stringifyValue(result[key]) : null;

    const getResultDetails = (job: SyncJob) => {
        const result = isRecord(job.result) ? job.result : null;
        const details: string[] = [];
        const part =
            getResultValue(result, "sync_part") ??
            getResultValue(result, "phase") ??
            getResultValue(result, "dataset_key") ??
            getResultValue(result, "provider") ??
            getResultValue(result, "mode");
        const category = getResultValue(result, "error_category");
        const reason =
            getResultValue(result, "partial_failure_summary") ??
            getResultValue(result, "reason") ??
            getResultValue(result, "message") ??
            getResultValue(result, "error");
        const failedUnits =
            getResultValue(result, "failed_unit_count") ?? getResultValue(result, "failed_units");
        const totalUnits = getResultValue(result, "total_units");
        const failedUnitIds = result?.failed_unit_ids;

        if (part) details.push(`Part: ${part}`);
        if (category) details.push(`Category: ${category}`);
        if (reason && reason !== job.error) details.push(reason);
        if (failedUnits) {
            details.push(
                totalUnits
                    ? `Failed units: ${failedUnits} of ${totalUnits}`
                    : `Failed units: ${failedUnits}`,
            );
        }
        if (Array.isArray(failedUnitIds) && failedUnitIds.length > 0) {
            details.push(`Unit IDs: ${failedUnitIds.slice(0, 3).join(", ")}`);
        }

        return details;
    };

    const getJobDetails = (job: SyncJob) => {
        const resultDetails = getResultDetails(job);
        if (job.error) return { primary: job.error, secondary: resultDetails, tone: "error" };
        if (job.status === "failed") {
            return {
                primary: resultDetails[0] ?? "Sync failed without a stored reason",
                secondary: resultDetails.slice(1),
                tone: "error",
            };
        }
        if (job.status === "cancelled") {
            return {
                primary: resultDetails[0] ?? "Sync was cancelled before completion",
                secondary: resultDetails.slice(1),
                tone: "error",
            };
        }
        if (job.status === "running") {
            return {
                primary: "Still running",
                secondary: [`Started ${formatTimestamp(job.started_at)}`],
                tone: "muted",
            };
        }
        if (job.status === "pending") {
            return { primary: "Queued", secondary: [], tone: "muted" };
        }
        return { primary: "-", secondary: [], tone: "muted" };
    };

    return (
        <div className="overflow-x-auto rounded-xl border border-(--card-stroke) bg-(--card-80)">
            <table className="min-w-full divide-y divide-(--card-stroke)">
                <thead className="bg-(--card-bg)">
                    <tr>
                        <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider"
                        >
                            Status
                        </th>
                        <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider"
                        >
                            Started At
                        </th>
                        <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider"
                        >
                            Completed / Last Activity
                        </th>
                        <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider"
                        >
                            Duration
                        </th>
                        <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider"
                        >
                            Items Synced
                        </th>
                        <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider"
                        >
                            Details
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-(--card-stroke) bg-(--card-80)">
                    {paginatedJobs.map((job) => {
                        const duration = getDuration(job);
                        const activityTimestamp = getActivityTimestamp(job);
                        const details = getJobDetails(job);
                        const runId =
                            isRecord(job.result) && typeof job.result.sync_run_id === "string"
                                ? job.result.sync_run_id
                                : null;
                        const href = runId
                            ? `/org/admin/sync/${configId}/runs/${runId}`
                            : null;

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
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {href ? (
                                        <Link
                                            href={href}
                                            aria-label={`View run details for sync run started ${formatTimestamp(
                                                job.started_at,
                                            )}`}
                                            className="inline-flex rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                                        >
                                            <SyncStatusBadge
                                                status={getBadgeStatus(job.status)}
                                                label={getBadgeLabel(job.status)}
                                            />
                                        </Link>
                                    ) : (
                                        <SyncStatusBadge
                                            status={getBadgeStatus(job.status)}
                                            label={getBadgeLabel(job.status)}
                                        />
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                                    {formatTimestamp(job.started_at)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                                    <div>{formatTimestamp(activityTimestamp)}</div>
                                    <div className="text-xs text-(--ink-muted)">
                                        {getActivityLabel(job)}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-(--ink-muted)">
                                    {duration}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-(--ink-muted)">
                                    {job.items_synced ?? "-"}
                                </td>
                                <td
                                    className={`px-6 py-4 text-sm ${
                                        details.tone === "error"
                                            ? "text-red-500"
                                            : "text-(--ink-muted)"
                                    }`}
                                >
                                    {details.primary !== "-" ? (
                                        <div
                                            title={[details.primary, ...details.secondary].join(
                                                " · ",
                                            )}
                                        >
                                            <div className="line-clamp-2">{details.primary}</div>
                                            {details.secondary.length > 0 && (
                                                <div className="mt-1 line-clamp-2 text-xs text-(--ink-muted)">
                                                    {details.secondary.join(" · ")}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-(--ink-muted)">-</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <div className="flex items-center justify-between border-t border-(--card-stroke) px-6 py-4">
                <span className="text-sm text-(--ink-muted)">
                    Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
                        disabled={offset === 0}
                        className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium hover:bg-(--card-70) disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {CTA_LABELS.previousPage}
                    </button>
                    <button
                        type="button"
                        onClick={() => setOffset((prev) => prev + limit)}
                        disabled={offset + limit >= total}
                        className="rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium hover:bg-(--card-70) disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {CTA_LABELS.nextPage}
                    </button>
                </div>
            </div>
        </div>
    );
}
