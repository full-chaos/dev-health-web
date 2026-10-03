"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";

import { Copy, Pencil, Play, Sparkles, Trash2 } from "lucide-react";

import { RefreshControl } from "@/components/admin/RefreshControl";
import { Button, buttonClassName } from "@/components/shared/Button";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { Notice } from "@/components/ui/Notice";
import { Section } from "@/components/ui/Section";
import { MarkdownRenderer } from "@/components/reports/MarkdownRenderer";
import { StatusBadge } from "@/components/reports/StatusBadge";
import { formatDateUTC } from "@/lib/formatters";
import { useOrgId } from "@/lib/graphql/provider";
import { logger } from "@/lib/logger";
import { SavedReport, ReportRun } from "@/lib/reports/types";
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

// Danger tone for the Delete action (theme tokens only): outlined, negative ink.
const DANGER_BUTTON = "border-(--negative)/40 text-(--negative) hover:bg-(--negative-wash)";

// Filled Delete (confirm panel). The secondary Button variant sets `text-foreground`, so the fill and
// the label token carry `!` to win. Label token `--accent-foreground` on `--negative`: 7.64:1 (light),
// 7.39:1 (dark); pinned in `deleteButton.test.tsx`.
const DANGER_FILL_BUTTON =
    "border-(--negative)! bg-(--negative)! text-(--accent-foreground)! hover:brightness-110";

type ReportParameters = {
    scope?: string;
    dateRange?: string;
    metrics?: string[];
};

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

    const runDate = latestRun?.startedAt ?? latestRun?.createdAt;

    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
                <Section
                    title="Latest Rendered Report"
                    action={
                        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-(--ink-muted)">
                            <span
                                data-testid="ai-report-label"
                                className="inline-flex items-center gap-1 rounded-full border border-(--card-stroke) px-2 py-0.5"
                            >
                                <Sparkles aria-hidden="true" className="h-3 w-3" />
                                AI-generated report
                            </span>
                            {latestRun ? (
                                <span>
                                    {runDate
                                        ? `Run of ${formatDateUTC(runDate)}`
                                        : "Run date not reported"}
                                </span>
                            ) : null}
                        </div>
                    }
                >
                    {latestRun?.renderedMarkdown ? (
                        <MarkdownRenderer content={latestRun.renderedMarkdown} />
                    ) : (
                        <p className="text-sm text-(--ink-muted)">
                            No rendered content available for this report.
                        </p>
                    )}
                </Section>
            </div>

            <div className="space-y-6">
                <Section title="Configuration">
                    <dl className="text-sm">
                        <FactRow label="Scope" value={scopeLabel(params.scope)} />
                        <FactRow
                            label="Date Range"
                            value={params.dateRange?.replace(/_/g, " ") || "Not set"}
                            capitalize
                        />
                        <FactRow
                            label="Schedule"
                            value={report.scheduleId ? "Scheduled" : "Manual"}
                        />
                    </dl>
                    <p className="mt-4 text-label-caps uppercase text-(--ink-muted)">Metrics</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {(params.metrics ?? []).length > 0 ? (
                            (params.metrics ?? []).map((m) => (
                                <span
                                    key={m}
                                    className="rounded-full bg-(--card-stroke) px-2.5 py-1 text-xs font-semibold"
                                >
                                    {m}
                                </span>
                            ))
                        ) : (
                            <span className="text-sm text-(--ink-muted)">Not set</span>
                        )}
                    </div>
                </Section>

                <Section
                    title="Run History"
                    action={
                        <RefreshControl
                            onRefresh={onRefreshRuns}
                            lastUpdatedAt={runsLastUpdatedAt}
                            isRefreshing={isRefreshingRuns}
                        />
                    }
                >
                    {runs.length > 0 ? (
                        <DataTable
                            accessibleLabel="Run history"
                            columns={RUN_COLUMNS}
                            data={runs}
                            rowKeyAction={(run) => run.id}
                            emptyMessage="No run history available."
                        />
                    ) : (
                        <p className="text-sm text-(--ink-muted)">No run history available.</p>
                    )}
                </Section>
            </div>
        </div>
    );
}

// The create form stores the scope as `org` / `team` / `repo`; show the form's own option names.
const SCOPE_LABELS: Record<string, string> = {
    org: "Organization",
    team: "Team",
    repo: "Repository",
};

function scopeLabel(scope?: string): string {
    if (!scope) return "Not set";
    return SCOPE_LABELS[scope] ?? scope;
}

function FactRow({
    label,
    value,
    capitalize = false,
}: {
    label: string;
    value: string;
    capitalize?: boolean;
}) {
    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-(--card-stroke) py-2.5 first:pt-0">
            <dt className="text-(--ink-muted)">{label}</dt>
            <dd className={`text-right font-semibold ${capitalize ? "capitalize" : ""}`}>
                {value}
            </dd>
        </div>
    );
}

const RUN_COLUMNS: readonly DataTableColumn<ReportRun>[] = [
    {
        key: "date",
        header: "Date",
        className: "whitespace-nowrap px-3 py-3.25",
        render: (run) => (run.startedAt ? formatDateUTC(run.startedAt) : "-"),
    },
    { key: "status", header: "Status", render: (run) => <StatusBadge status={run.status} /> },
    {
        key: "duration",
        header: "Duration",
        numeric: true,
        render: (run) => (run.durationSeconds != null ? `${run.durationSeconds.toFixed(1)}s` : "-"),
    },
    {
        key: "trigger",
        header: "Trigger",
        className: "px-3 py-3.25 capitalize",
        render: (run) => run.triggeredBy,
    },
];

export default function SingleReportPage() {
    // The org of the signed-in session (the layout's provider): the backend reads only the caller's own org.
    const orgId = useOrgId();
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
        // No org yet: no request (the page keeps its loading state until the session org arrives).
        if (!orgId) return;
        async function loadData(orgId: string) {
            const isTestMode = publicEnv.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";
            const [reportData, runsData] = await Promise.all([
                fetchSavedReport(orgId, id, isTestMode),
                fetchReportRuns(orgId, id, undefined, isTestMode),
            ]);
            setReport(reportData);
            setRuns(runsData.items);
            setRunsLastUpdatedAt(new Date().toISOString());
            setIsLoading(false);
        }
        loadData(orgId);
    }, [id, orgId]);

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
        if (!orgId) return;
        runsFetchSeqRef.current += 1;
        const mySeq = runsFetchSeqRef.current;
        setIsRefreshingRuns(true);
        try {
            const isTestMode = publicEnv.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";
            const runsData = await fetchReportRuns(orgId, id, undefined, isTestMode);
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
    }, [id, orgId]);

    if (isLoading) {
        return (
            // Rendered inside the shared app shell: the layout owns the navigation, the
            // page padding and the `<main>` landmark.
            <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
                <DataState variant="loading" title="Loading report..." />
            </div>
        );
    }

    if (!report) {
        return (
            <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
                <DataState
                    variant="detector-enabled-no-findings"
                    title="Report not found."
                    description="It may have been deleted, or the link is wrong."
                    action={
                        <Link href="/reports" className={buttonClassName("secondary", "md")}>
                            {backToArea("Reports")}
                        </Link>
                    }
                />
            </div>
        );
    }

    // CHAOS-4318: trigger, then a single fetch to pick up whatever the
    // backend has persisted by the time the request returns — no more
    // setInterval poll loop. Seeing the run through to completion is what
    // the Run History card's Refresh control (with a last-updated
    // timestamp) is for.
    const handleRunNow = async () => {
        if (!orgId) return;
        setIsRunning(true);
        setError(null);

        try {
            await triggerReport(orgId, id);
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
        if (!orgId) return;
        setIsSaving(true);
        setError(null);
        try {
            const updated = await updateSavedReport(orgId, id, {
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
        if (!orgId) return;
        setIsCloning(true);
        setError(null);
        try {
            const cloned = await cloneSavedReport(orgId, {
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
        if (!orgId) return;
        setIsDeleting(true);
        setError(null);
        try {
            await deleteSavedReport(orgId, id);
            router.push("/reports");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete report");
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            {error && <Notice variant="danger">{error}</Notice>}

            <PageHeader
                title={report.name}
                subtitle={report.description}
                back={{ href: "/reports", area: "Reports" }}
                actions={
                    isEditing ? undefined : (
                        <div className="flex items-center gap-2">
                            <Button
                                onClick={handleEditStart}
                                icon={<Pencil className="h-3.5 w-3.5" />}
                            >
                                {CTA_LABELS.edit}
                            </Button>
                            <Button
                                onClick={handleCloneStart}
                                icon={<Copy className="h-3.5 w-3.5" />}
                            >
                                {CTA_LABELS.clone}
                            </Button>
                            <Button
                                onClick={() => setShowDeleteConfirm(true)}
                                className={DANGER_BUTTON}
                                icon={<Trash2 className="h-3.5 w-3.5" />}
                            >
                                {CTA_LABELS.delete}
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleRunNow}
                                disabled={isRunning}
                                icon={<Play className="h-3.5 w-3.5" />}
                            >
                                {isRunning ? "Running..." : CTA_LABELS.runNow}
                            </Button>
                        </div>
                    )
                }
            >
                {/* Edit mode: the name stays the h1; the fields are under it. */}
                {isEditing ? (
                    <div className="space-y-3">
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
                            <Button
                                variant="primary"
                                onClick={handleEditSave}
                                disabled={isSaving || !editName.trim()}
                            >
                                {isSaving ? CTA_LABELS.saving : CTA_LABELS.save}
                            </Button>
                            <Button onClick={handleEditCancel} disabled={isSaving}>
                                {CTA_LABELS.cancel}
                            </Button>
                        </div>
                    </div>
                ) : null}
            </PageHeader>

            {showCloneDialog && (
                <Section title="Clone Report" data-testid="clone-panel">
                    <div className="space-y-3 max-w-md">
                        <input
                            type="text"
                            value={cloneName}
                            onChange={(e) => setCloneName(e.target.value)}
                            className="w-full rounded-xl border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                            placeholder="Name for cloned report"
                        />
                        <div className="flex gap-2">
                            <Button
                                variant="primary"
                                onClick={handleCloneConfirm}
                                disabled={isCloning}
                            >
                                {isCloning ? "Cloning..." : CTA_LABELS.clone}
                            </Button>
                            <Button onClick={() => setShowCloneDialog(false)} disabled={isCloning}>
                                {CTA_LABELS.cancel}
                            </Button>
                        </div>
                    </div>
                </Section>
            )}

            {showDeleteConfirm && (
                <Section
                    title="Delete Report"
                    description={`Are you sure you want to delete \u201c${report.name}\u201d? This action cannot be undone.`}
                    data-testid="delete-panel"
                    className="border-l-4 border-l-(--negative)"
                    action={
                        <div className="flex gap-2">
                            <Button
                                onClick={handleDeleteConfirm}
                                disabled={isDeleting}
                                className={DANGER_FILL_BUTTON}
                                icon={<Trash2 className="h-3.5 w-3.5" />}
                            >
                                {isDeleting ? "Deleting..." : CTA_LABELS.delete}
                            </Button>
                            <Button
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                            >
                                {CTA_LABELS.cancel}
                            </Button>
                        </div>
                    }
                />
            )}

            <RenderedReportAndConfig
                report={report}
                runs={runs}
                runsLastUpdatedAt={runsLastUpdatedAt}
                isRefreshingRuns={isRefreshingRuns}
                onRefreshRuns={refreshRuns}
            />
        </div>
    );
}
