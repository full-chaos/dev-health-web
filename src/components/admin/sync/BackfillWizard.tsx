"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { triggerBackfill } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";

/** Ranges longer than this need explicit confirmation before submit (CHAOS-2796). */
const EXPENSIVE_RANGE_THRESHOLD_DAYS = 180;

/**
 * Client-side ESTIMATE only, matching the non-Linear family default chunk
 * window in ops/sync/planner.py (`chunk_days = 7`). This is a display
 * estimate for the preview step, never the source of truth — the backend
 * planner computes actual chunking at dispatch time and per-provider policy
 * can differ (e.g. Linear's max window), so this must not be presented as
 * exact.
 */
const ESTIMATED_CHUNK_DAYS = 7;

const RANGE_ERROR_ID = "backfill-range-error";

type WizardStep = "range" | "preview" | "result";

interface BackfillWizardProps {
    configId: string;
    onCloseAction: () => void;
    /** Gap-driven prefill (YYYY-MM-DD) from the coverage timeline's "Backfill this gap" action. */
    initialSince?: string;
    initialBefore?: string;
    /** Resolved dataset/source NAMES from the coverage summary already on the page — never raw ids. */
    datasetNames: string[];
    sourceNames: string[];
    /** When true, submit is a no-op demo path instead of calling the live server action. */
    testMode?: boolean;
}

function parseDateInput(value: string): Date | null {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole-day span between two YYYY-MM-DD inputs, or null if either is unparseable. */
function rangeDays(since: string, before: string): number | null {
    const sinceDate = parseDateInput(since);
    const beforeDate = parseDateInput(before);
    if (!sinceDate || !beforeDate) return null;
    return Math.round((beforeDate.getTime() - sinceDate.getTime()) / (24 * 60 * 60 * 1000));
}

export function BackfillWizard({
    configId,
    onCloseAction,
    initialSince = "",
    initialBefore = "",
    datasetNames,
    sourceNames,
    testMode = false,
}: BackfillWizardProps) {
    const router = useRouter();
    const [step, setStep] = useState<WizardStep>("range");
    const [since, setSince] = useState(initialSince);
    const [before, setBefore] = useState(initialBefore);
    const [expensiveConfirmed, setExpensiveConfirmed] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submittedSyncRunId, setSubmittedSyncRunId] = useState<string | null>(null);

    const days = rangeDays(since, before);
    const hasBothDates = Boolean(since) && Boolean(before);
    const isRangeInvalid = hasBothDates && days !== null && days <= 0;
    const isExpensiveRange = days !== null && days > EXPENSIVE_RANGE_THRESHOLD_DAYS;
    const chunkEstimate =
        days !== null && days > 0 ? Math.max(1, Math.ceil(days / ESTIMATED_CHUNK_DAYS)) : 0;

    const canContinue = hasBothDates && !isRangeInvalid;
    const canSubmit = canContinue && (!isExpensiveRange || expensiveConfirmed);

    const handleSubmit = () => {
        if (!canSubmit) return;
        setSubmitError(null);

        if (testMode) {
            // Test-mode demo path: no live API call (web AGENTS test-mode rule).
            // Mirrors the sample sync_run id already used by the gaps coverage
            // sample so "View run" resolves to a valid sample run page.
            setSubmittedSyncRunId("sample-run-gaps");
            setStep("result");
            return;
        }

        startTransition(async () => {
            const result = await triggerBackfill(configId, since, before);
            if (result.error || !result.data) {
                setSubmitError(result.error ?? "Failed to start backfill");
                toast.error(result.error ?? "Failed to start backfill");
                return;
            }
            toast.success("Backfill started");
            setSubmittedSyncRunId(result.data.sync_run_id ?? null);
            setStep("result");
            router.refresh();
        });
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onKeyDown={(event) => {
                if (event.key === "Escape") onCloseAction();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="backfill-wizard-title"
                className="w-full max-w-xl rounded-xl border border-(--card-stroke) bg-(--card) shadow-2xl"
            >
                <div className="flex items-center justify-between border-b border-(--card-stroke) p-6">
                    <div>
                        <h2 id="backfill-wizard-title" className="text-lg font-semibold text-foreground">
                            Run historical backfill
                        </h2>
                        <p className="mt-1 text-xs text-(--ink-muted)">
                            Step {step === "range" ? 1 : step === "preview" ? 2 : 3} of 3
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onCloseAction}
                        className="rounded-md px-2 py-1 text-(--ink-muted) hover:bg-(--card-80)"
                    >
                        {CTA_LABELS.closeWizard}
                    </button>
                </div>

                <div className="space-y-4 p-6">
                    {step === "range" && (
                        <>
                            <p className="text-sm text-(--ink-muted)">
                                Backfill fetches historical data for the selected window. It does not
                                affect incremental sync watermarks — regular scheduled syncs continue
                                independently.
                            </p>

                            <div className="flex items-end gap-3">
                                <div className="flex-1">
                                    <label
                                        htmlFor="backfill-since"
                                        className="mb-1.5 block text-sm font-medium text-(--ink-muted)"
                                    >
                                        From
                                    </label>
                                    <input
                                        id="backfill-since"
                                        type="date"
                                        value={since}
                                        onChange={(event) => setSince(event.target.value)}
                                        aria-invalid={isRangeInvalid}
                                        aria-describedby={isRangeInvalid ? RANGE_ERROR_ID : undefined}
                                        className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label
                                        htmlFor="backfill-before"
                                        className="mb-1.5 block text-sm font-medium text-(--ink-muted)"
                                    >
                                        To
                                    </label>
                                    <input
                                        id="backfill-before"
                                        type="date"
                                        value={before}
                                        onChange={(event) => setBefore(event.target.value)}
                                        aria-invalid={isRangeInvalid}
                                        aria-describedby={isRangeInvalid ? RANGE_ERROR_ID : undefined}
                                        className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                    />
                                </div>
                            </div>

                            {isRangeInvalid && (
                                <p id={RANGE_ERROR_ID} role="alert" className="text-sm text-(--negative)">
                                    Start date must be before end date.
                                </p>
                            )}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <p className="text-xs font-medium text-(--ink-muted) uppercase tracking-wider">
                                        Affected datasets
                                    </p>
                                    <p className="text-sm text-foreground">
                                        {datasetNames.length > 0
                                            ? datasetNames.join(", ")
                                            : "No coverage data yet"}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs font-medium text-(--ink-muted) uppercase tracking-wider">
                                        Affected sources
                                    </p>
                                    <p className="text-sm text-foreground">
                                        {sourceNames.length > 0
                                            ? sourceNames.join(", ")
                                            : "No coverage data yet"}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={onCloseAction}
                                    className="rounded-md border border-(--card-stroke) px-4 py-2 text-sm"
                                >
                                    {CTA_LABELS.cancel}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStep("preview")}
                                    disabled={!canContinue}
                                    className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
                                >
                                    {CTA_LABELS.continueStep}
                                </button>
                            </div>
                        </>
                    )}

                    {step === "preview" && (
                        <>
                            <dl className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <dt className="text-xs font-medium text-(--ink-muted) uppercase tracking-wider">
                                        Range
                                    </dt>
                                    <dd className="mt-1 text-foreground">
                                        {since} → {before}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium text-(--ink-muted) uppercase tracking-wider">
                                        Estimated chunks
                                    </dt>
                                    <dd className="mt-1 text-foreground">~{chunkEstimate} (estimate)</dd>
                                </div>
                            </dl>

                            {isExpensiveRange && (
                                <div
                                    role="alert"
                                    className="space-y-3 rounded-lg border border-(--caution)/30 bg-(--caution)/15 p-4"
                                >
                                    <p className="text-sm font-medium text-(--caution)">
                                        ⚠ This range spans {days} days, more than{" "}
                                        {EXPENSIVE_RANGE_THRESHOLD_DAYS}. Large backfills can take a long
                                        time and consume significant sync capacity.
                                    </p>
                                    <label
                                        htmlFor="backfill-expensive-confirm"
                                        className="flex items-start gap-2 text-sm text-foreground"
                                    >
                                        <input
                                            id="backfill-expensive-confirm"
                                            type="checkbox"
                                            checked={expensiveConfirmed}
                                            onChange={(event) =>
                                                setExpensiveConfirmed(event.target.checked)
                                            }
                                            className="mt-0.5"
                                        />
                                        I understand this is a large backfill and want to proceed.
                                    </label>
                                </div>
                            )}

                            {submitError && (
                                <p role="alert" className="text-sm text-(--negative)">
                                    {submitError}
                                </p>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setStep("range")}
                                    className="rounded-md border border-(--card-stroke) px-4 py-2 text-sm"
                                >
                                    {CTA_LABELS.backButton}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={!canSubmit || isPending}
                                    className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
                                >
                                    {isPending ? "Starting..." : CTA_LABELS.runBackfill}
                                </button>
                            </div>
                        </>
                    )}

                    {step === "result" && (
                        <>
                            <p className="text-sm text-foreground">
                                Backfill started. Progress will appear on this page as the backend
                                processes the range.
                            </p>
                            {submittedSyncRunId && (
                                <Link
                                    href={`/org/admin/sync/${configId}/runs/${submittedSyncRunId}`}
                                    className="inline-block text-sm text-(--accent) hover:underline"
                                >
                                    {CTA_LABELS.viewRun}
                                </Link>
                            )}
                            <div className="flex items-center justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={onCloseAction}
                                    className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
                                >
                                    {CTA_LABELS.done}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
