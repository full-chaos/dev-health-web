"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";

import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { RefreshControl } from "@/components/admin/RefreshControl";
import { MarkdownRenderer } from "@/components/reports/MarkdownRenderer";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { logger } from "@/lib/logger";
import { ReportStatus, SavedReport, ReportRun } from "@/lib/reports/types";
import {
    fetchSavedReport,
    fetchReportRuns,
    triggerReport,
    updateSavedReport,
    cloneSavedReport,
    deleteSavedReport,
} from "@/lib/reports/fetchers";
import { publicEnv } from "@/lib/config";
import { backToArea, CTA_LABELS } from "@/lib/design/cta";

type ReportParameters = {
    scope?: string;
    dateRange?: string;
    metrics?: string[];
};

function StatusBadge({ status }: { status?: string }) {
    if (!status)
        return (
            <span className="rounded-full bg-(--card-stroke) px-2 py-0.5 text-label-caps uppercase tracking-wider text-(--ink-muted)">
                Never run
            </span>
        );

    switch (status) {
        case ReportStatus.SUCCESS:
            return (
                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-label-caps uppercase tracking-wider text-green-500">
                    Success
                </span>
            );
        case ReportStatus.FAILED:
            return (
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-label-caps uppercase tracking-wider text-red-500">
                    Failed
                </span>
            );
        case ReportStatus.RUNNING:
            return (
                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-label-caps uppercase tracking-wider text-blue-500">
                    Running
                </span>
            );
        case ReportStatus.PENDING:
            return (
                <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-label-caps uppercase tracking-wider text-yellow-500">
                    Pending
                </span>
            );
        default:
            return null;
    }
}

function RenderedReportAndConfig({
    report,
    runs,
    runsLastUpdatedAt,
    isRefreshingRuns,
    onRefreshRuns,
}: {
    report: SavedReport;
    runs: ReportRun[];
    runsLastUpdatedAt: string | null;
    isRefreshingRuns: boolean;
    onRefreshRuns: () => void | Promise<void>;
}) {
    const params = (report.parameters ?? {}) as ReportParameters;
    const latestRun = runs.find((r) => r.renderedMarkdown) ?? runs[0];

    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
                <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
                    <h2 className="font-(--font-display) text-xl mb-4">Latest Rendered Report</h2>
                    {latestRun?.renderedMarkdown ? (
                        <MarkdownRenderer content={latestRun.renderedMarkdown} />
                    ) : (
                        <p className="text-sm text-(--ink-muted)">
                            No rendered content available for this report.
                        </p>
                    )}
                </div>
            </div>

            <div className="space-y-6">
                <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
                    <h2 className="font-(--font-display) text-xl mb-4">Configuration</h2>
                    <dl className="space-y-4 text-sm">
                        <div>
                            <dt className="text-(--ink-muted) text-xs uppercase tracking-wider">
                                Scope
                            </dt>
                            <dd className="mt-1 font-medium capitalize">
                                {params.scope || "Organization"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-(--ink-muted) text-xs uppercase tracking-wider">
                                Date Range
                            </dt>
                            <dd className="mt-1 font-medium">
                                {params.dateRange?.replace(/_/g, " ") || "Not set"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-(--ink-muted) text-xs uppercase tracking-wider">
                                Schedule
                            </dt>
                            <dd className="mt-1 font-medium capitalize">
                                {report.scheduleId ? "Scheduled" : "Manual"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-(--ink-muted) text-xs uppercase tracking-wider">
                                Metrics
                            </dt>
                            <dd className="mt-1 font-medium">
                                <div className="flex flex-wrap gap-2">
                                    {(params.metrics ?? []).map((m) => (
                                        <span
                                            key={m}
                                            className="rounded-md bg-(--card-70) px-2 py-1 text-xs"
                                        >
                                            {m}
                                        </span>
                                    ))}
                                </div>
                            </dd>
                        </div>
                    </dl>
                </div>

                <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="font-(--font-display) text-xl">Run History</h2>
                        <RefreshControl
                            onRefresh={onRefreshRuns}
                            lastUpdatedAt={runsLastUpdatedAt}
                            isRefreshing={isRefreshingRuns}
                        />
                    </div>
                    {runs.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-(--card-stroke) text-(--ink-muted)">
                                        <th className="pb-2 font-medium">Date</th>
                                        <th className="pb-2 font-medium">Status</th>
                                        <th className="pb-2 font-medium">Duration</th>
                                        <th className="pb-2 font-medium">Trigger</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-(--card-stroke)">
                                    {runs.map((run) => (
                                        <tr
                                            key={run.id}
                                            className="hover:bg-(--card-70) transition-colors"
                                        >
                                            <td className="py-3">
                                                {run.startedAt
                                                    ? new Date(run.startedAt).toLocaleDateString()
                                                    : "-"}
                                            </td>
                                            <td className="py-3">
                                                <StatusBadge status={run.status} />
                                            </td>
                                            <td className="py-3">
                                                {run.durationSeconds != null
                                                    ? `${run.durationSeconds.toFixed(1)}s`
                                                    : "-"}
                                            </td>
                                            <td className="py-3 capitalize">{run.triggeredBy}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-sm text-(--ink-muted)">No run history available.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function SingleReportPage() {
    const params = useParams();
    const router = useRouter();
    const id =
        typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

    const [report, setReport] = useState<SavedReport | null>(null);
    const [runs, setRuns] = useState<ReportRun[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const [showCloneDialog, setShowCloneDialog] = useState(false);
    const [cloneName, setCloneName] = useState("");
    const [isCloning, setIsCloning] = useState(false);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // CHAOS-4318: no more timer-driven polling against the Python API — runs
    // are fetched on mount/navigation and otherwise only on an explicit
    // Refresh click (with a last-updated timestamp).
    const [runsLastUpdatedAt, setRunsLastUpdatedAt] = useState<string | null>(null);
    const [isRefreshingRuns, setIsRefreshingRuns] = useState(false);

    useEffect(() => {
        async function loadData() {
            const isTestMode = publicEnv.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";
            const [reportData, runsData] = await Promise.all([
                fetchSavedReport("default-org", id, isTestMode),
                fetchReportRuns("default-org", id, undefined, isTestMode),
            ]);
            setReport(reportData);
            setRuns(runsData.items);
            setRunsLastUpdatedAt(new Date().toISOString());
            setIsLoading(false);
        }
        loadData();
    }, [id]);

    // Shared by the Run History Refresh control AND the post-trigger
    // follow-up fetch in handleRunNow — a sequence guard so a slower,
    // superseded response (e.g. a manual Refresh click that started before
    // Run Now's own follow-up fetch) can never overwrite fresher run-history
    // data that already landed.
    const runsFetchSeqRef = useRef(0);

    // Deliberately never touches `isRunning` — that lock belongs solely to
    // handleRunNow's own trigger-mutation lifecycle (see below). Letting a
    // Refresh click clear it here — as an earlier version of this code did,
    // based on the fetched latest run already being terminal — could
    // re-enable "Run Now" while `triggerReport` was still in flight (the
    // fetch races the mutation and can read stale data), letting a second
    // click fire a duplicate report generation.
    const refreshRuns = useCallback(async () => {
        runsFetchSeqRef.current += 1;
        const mySeq = runsFetchSeqRef.current;
        setIsRefreshingRuns(true);
        try {
            const isTestMode = publicEnv.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";
            const runsData = await fetchReportRuns("default-org", id, undefined, isTestMode);
            if (mySeq !== runsFetchSeqRef.current) return;

            setRuns(runsData.items);
            setRunsLastUpdatedAt(new Date().toISOString());
        } catch (refreshErr) {
            logger.error({ err: refreshErr }, "Report run refresh failed");
        } finally {
            if (mySeq === runsFetchSeqRef.current) {
                setIsRefreshingRuns(false);
            }
        }
    }, [id]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                    <PrimaryNav filters={defaultMetricFilter} active="reports" />
                    <main className="flex min-w-0 flex-1 flex-col gap-8">
                        <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-10 text-center">
                            <p className="text-(--ink-muted)">Loading report...</p>
                        </div>
                    </main>
                </div>
            </div>
        );
    }

    if (!report) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                    <PrimaryNav filters={defaultMetricFilter} active="reports" />
                    <main className="flex min-w-0 flex-1 flex-col gap-8">
                        <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-10 text-center">
                            <p className="text-(--ink-muted)">Report not found.</p>
                            <Link
                                href="/reports"
                                className="mt-4 inline-block rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em] hover:bg-(--card-70) transition-colors"
                            >
                                {backToArea("Reports")}
                            </Link>
                        </div>
                    </main>
                </div>
            </div>
        );
    }

    // CHAOS-4318: trigger, then a single fetch to pick up whatever the
    // backend has persisted by the time the request returns — no more
    // setInterval poll loop. Seeing the run through to completion is what
    // the Run History card's Refresh control (with a last-updated
    // timestamp) is for.
    const handleRunNow = async () => {
        setIsRunning(true);
        setError(null);

        try {
            await triggerReport("default-org", id);
            await refreshRuns();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to trigger report");
        } finally {
            setIsRunning(false);
        }
    };

    const handleEditStart = () => {
        setEditName(report.name);
        setEditDescription(report.description ?? "");
        setIsEditing(true);
        setError(null);
    };

    const handleEditSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            const updated = await updateSavedReport("default-org", id, {
                name: editName,
                description: editDescription || undefined,
            });
            setReport(updated);
            setIsEditing(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update report");
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditCancel = () => {
        setIsEditing(false);
        setError(null);
    };

    const handleCloneStart = () => {
        setCloneName(`${report.name} (Copy)`);
        setShowCloneDialog(true);
        setError(null);
    };

    const handleCloneConfirm = async () => {
        setIsCloning(true);
        setError(null);
        try {
            const cloned = await cloneSavedReport("default-org", {
                sourceReportId: id,
                newName: cloneName || undefined,
            });
            router.push(`/reports/${cloned.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to clone report");
            setIsCloning(false);
        }
    };

    const handleDeleteConfirm = async () => {
        setIsDeleting(true);
        setError(null);
        try {
            await deleteSavedReport("default-org", id);
            router.push("/reports");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete report");
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={defaultMetricFilter} active="reports" />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    {error && (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                            {error}
                        </div>
                    )}

                    <header className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                                <Link
                                    href="/reports"
                                    className="text-(--ink-muted) hover:text-foreground transition-colors"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <title>Back to reports</title>
                                        <path d="m15 18-6-6 6-6" />
                                    </svg>
                                </Link>
                                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                    Report Details
                                </p>
                            </div>
                            {isEditing ? (
                                <div className="mt-2 space-y-3">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="w-full rounded-xl border border-(--card-stroke) bg-(--card-70) px-4 py-2 font-(--font-display) text-2xl focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                    />
                                    <textarea
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        rows={2}
                                        className="w-full rounded-xl border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                        placeholder="Description"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={handleEditSave}
                                            disabled={isSaving || !editName.trim()}
                                            className="rounded-full bg-(--accent) px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-white hover:bg-(--accent-hover) transition-colors disabled:opacity-50"
                                        >
                                            {isSaving ? CTA_LABELS.saving : CTA_LABELS.save}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleEditCancel}
                                            disabled={isSaving}
                                            className="rounded-full border border-(--card-stroke) px-4 py-1.5 text-xs uppercase tracking-[0.2em] hover:bg-(--card-70) transition-colors"
                                        >
                                            {CTA_LABELS.cancel}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <h1 className="mt-2 font-(--font-display) text-3xl">
                                        {report.name}
                                    </h1>
                                    <p className="mt-2 text-sm text-(--ink-muted)">
                                        {report.description}
                                    </p>
                                </>
                            )}
                        </div>
                        {!isEditing && (
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleEditStart}
                                    className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em] hover:bg-(--card-70) transition-colors"
                                >
                                    {CTA_LABELS.edit}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCloneStart}
                                    className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em] hover:bg-(--card-70) transition-colors"
                                >
                                    {CTA_LABELS.clone}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="rounded-full border border-red-500/30 px-4 py-2 text-xs uppercase tracking-[0.2em] text-red-500 hover:bg-red-500/10 transition-colors"
                                >
                                    {CTA_LABELS.delete}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRunNow}
                                    disabled={isRunning}
                                    className="rounded-full bg-(--accent) px-4 py-2 text-xs uppercase tracking-[0.2em] text-white hover:bg-(--accent-hover) transition-colors disabled:opacity-50"
                                >
                                    {isRunning ? "Running..." : CTA_LABELS.runNow}
                                </button>
                            </div>
                        )}
                    </header>

                    {showCloneDialog && (
                        <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-6">
                            <h2 className="font-(--font-display) text-lg mb-3">Clone Report</h2>
                            <div className="space-y-3 max-w-md">
                                <input
                                    type="text"
                                    value={cloneName}
                                    onChange={(e) => setCloneName(e.target.value)}
                                    className="w-full rounded-xl border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                    placeholder="Name for cloned report"
                                />
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleCloneConfirm}
                                        disabled={isCloning}
                                        className="rounded-full bg-(--accent) px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-white hover:bg-(--accent-hover) transition-colors disabled:opacity-50"
                                    >
                                        {isCloning ? "Cloning..." : CTA_LABELS.clone}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowCloneDialog(false)}
                                        disabled={isCloning}
                                        className="rounded-full border border-(--card-stroke) px-4 py-1.5 text-xs uppercase tracking-[0.2em] hover:bg-(--card-70) transition-colors"
                                    >
                                        {CTA_LABELS.cancel}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {showDeleteConfirm && (
                        <div className="rounded-3xl border border-red-500/30 bg-red-500/5 p-6">
                            <h2 className="font-(--font-display) text-lg text-red-500 mb-2">
                                Delete Report
                            </h2>
                            <p className="text-sm text-(--ink-muted) mb-4">
                                Are you sure you want to delete &ldquo;{report.name}&rdquo;? This
                                action cannot be undone.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleDeleteConfirm}
                                    disabled={isDeleting}
                                    className="rounded-full bg-red-500 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                                >
                                    {isDeleting ? "Deleting..." : CTA_LABELS.delete}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(false)}
                                    disabled={isDeleting}
                                    className="rounded-full border border-(--card-stroke) px-4 py-1.5 text-xs uppercase tracking-[0.2em] hover:bg-(--card-70) transition-colors"
                                >
                                    {CTA_LABELS.cancel}
                                </button>
                            </div>
                        </div>
                    )}

                    <RenderedReportAndConfig
                        report={report}
                        runs={runs}
                        runsLastUpdatedAt={runsLastUpdatedAt}
                        isRefreshingRuns={isRefreshingRuns}
                        onRefreshRuns={refreshRuns}
                    />
                </main>
            </div>
        </div>
    );
}
