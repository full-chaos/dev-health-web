"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { triggerBackfill } from "@/lib/admin/server";
import type {
    SyncCoverageBackfillWindow,
    SyncCoverageDataset,
    SyncCoverageSource,
} from "@/lib/admin/types";
import { DATASET_LABELS } from "./config-form/constants";
import { CTA_LABELS } from "@/lib/design/cta";

const EXPENSIVE_RANGE_THRESHOLD_DAYS = 180;
const ESTIMATED_CHUNK_DAYS = 7;
const RANGE_ERROR_ID = "backfill-range-error";
const SCOPE_ERROR_ID = "backfill-scope-error";
const WORK_ITEM_FAMILY = new Set([
    "work-items",
    "work-item-labels",
    "work-item-projects",
    "work-item-history",
    "work-item-comments",
]);

type WizardStep = "scope" | "review" | "result";
type ScopeMode = "all" | "selected";

interface DatasetChoice {
    id: string;
    label: string;
    datasetKeys: string[];
}

interface BackfillWizardProps {
    configId: string;
    onCloseAction: () => void;
    /** Server-authorized exact scope selected from coverage, if any. */
    initialWindow?: SyncCoverageBackfillWindow;
    /** Present empty means Ops has no exact suggestion for this coverage state. */
    suggestedWindows?: SyncCoverageBackfillWindow[];
    datasets: SyncCoverageDataset[];
    sources: SyncCoverageSource[];
    testMode?: boolean;
}

function parseDateInput(value: string): Date | null {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function rangeDays(since: string, before: string): number | null {
    const sinceDate = parseDateInput(since);
    const beforeDate = parseDateInput(before);
    if (!sinceDate || !beforeDate) return null;
    return Math.round((beforeDate.getTime() - sinceDate.getTime()) / 86_400_000);
}

function toBoundary(value: string): string {
    return `${value}T00:00:00.000Z`;
}

function toDateInput(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
}

function datasetLabel(key: string): string {
    return DATASET_LABELS[key] ?? key.replaceAll("-", " ");
}

function sameDatasetKeys(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    const sortedLeft = [...left].sort();
    const sortedRight = [...right].sort();
    return sortedLeft.every((key, index) => key === sortedRight[index]);
}

/** Collapse the work-item aliases into the single canonical family operators execute. */
export function buildDatasetChoices(
    datasets: SyncCoverageDataset[],
    scopedDatasetKeys: string[] = [],
): DatasetChoice[] {
    const choices: DatasetChoice[] = [];
    const familyKeys = datasets
        .map((dataset) => dataset.dataset_key)
        .filter((key) => WORK_ITEM_FAMILY.has(key));

    for (const dataset of datasets) {
        if (WORK_ITEM_FAMILY.has(dataset.dataset_key)) {
            if (!choices.some((choice) => choice.id === "work-items")) {
                choices.push({
                    id: "work-items",
                    label: "Work items (canonical family)",
                    datasetKeys: familyKeys,
                });
            }
            continue;
        }
        choices.push({
            id: dataset.dataset_key,
            label: datasetLabel(dataset.dataset_key),
            datasetKeys: [dataset.dataset_key],
        });
    }

    const scopedFamilyKeys = scopedDatasetKeys.filter((key) => WORK_ITEM_FAMILY.has(key));
    if (scopedFamilyKeys.length > 0 && !sameDatasetKeys(scopedFamilyKeys, familyKeys)) {
        choices.unshift({
            id: "server-scoped-work-items",
            label: "Suggested work-item datasets",
            datasetKeys: scopedFamilyKeys,
        });
    }
    return choices;
}

function choiceIdsForDatasetScope(
    choices: DatasetChoice[],
    datasetKeys: string[] | undefined,
): string[] {
    if (!datasetKeys || datasetKeys.length === 0) return [];
    const exactChoice = choices.find((choice) => sameDatasetKeys(choice.datasetKeys, datasetKeys));
    if (exactChoice) return [exactChoice.id];

    const remaining = new Set(datasetKeys);
    const selectedChoiceIds: string[] = [];
    for (const choice of choices) {
        if (choice.datasetKeys.every((key) => remaining.has(key))) {
            selectedChoiceIds.push(choice.id);
            choice.datasetKeys.forEach((key) => remaining.delete(key));
        }
    }
    return remaining.size === 0 ? selectedChoiceIds : [];
}

function sourceIdsInInventory(
    sourceIds: string[] | undefined,
    sources: SyncCoverageSource[],
): string[] {
    const available = new Set(sources.map((source) => source.source_id));
    return (sourceIds ?? []).filter((sourceId) => available.has(sourceId));
}

function windowLabel(window: SyncCoverageBackfillWindow): string {
    const datasetScope = window.dataset_keys?.join(", ") ?? "all datasets";
    return `${toDateInput(window.since)} to ${toDateInput(window.before)} · ${datasetScope}`;
}

export function BackfillWizard({
    configId,
    onCloseAction,
    initialWindow,
    suggestedWindows,
    datasets,
    sources,
    testMode = false,
}: BackfillWizardProps) {
    const router = useRouter();
    const [scopedDatasetKeys, setScopedDatasetKeys] = useState<string[]>(
        initialWindow?.dataset_keys ?? [],
    );
    const datasetChoices = useMemo(
        () => buildDatasetChoices(datasets, scopedDatasetKeys),
        [datasets, scopedDatasetKeys],
    );
    const [step, setStep] = useState<WizardStep>("scope");
    const [since, setSince] = useState(() =>
        initialWindow ? toDateInput(initialWindow.since) : "",
    );
    const [before, setBefore] = useState(() =>
        initialWindow ? toDateInput(initialWindow.before) : "",
    );
    const [sourceMode, setSourceMode] = useState<ScopeMode>(() =>
        initialWindow?.source_ids?.length ? "selected" : "all",
    );
    const [datasetMode, setDatasetMode] = useState<ScopeMode>(() =>
        initialWindow?.dataset_keys?.length ? "selected" : "all",
    );
    const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(() =>
        sourceIdsInInventory(initialWindow?.source_ids, sources),
    );
    const [selectedDatasetChoiceIds, setSelectedDatasetChoiceIds] = useState<string[]>(() =>
        choiceIdsForDatasetScope(datasetChoices, initialWindow?.dataset_keys),
    );
    const [expensiveConfirmed, setExpensiveConfirmed] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submittedSyncRunId, setSubmittedSyncRunId] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const onCloseActionRef = useRef(onCloseAction);

    useEffect(() => {
        onCloseActionRef.current = onCloseAction;
    }, [onCloseAction]);

    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null;
        dialogRef.current?.focus();
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onCloseActionRef.current();
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            previouslyFocused?.focus();
        };
    }, []);

    const days = rangeDays(since, before);
    const hasBothDates = Boolean(since) && Boolean(before);
    const isRangeInvalid = hasBothDates && days !== null && days <= 0;
    const sourceSelectionInvalid = sourceMode === "selected" && selectedSourceIds.length === 0;
    const datasetSelectionInvalid =
        datasetMode === "selected" && selectedDatasetChoiceIds.length === 0;
    const isScopeInvalid = sourceSelectionInvalid || datasetSelectionInvalid;
    const isExpensiveRange = days !== null && days > EXPENSIVE_RANGE_THRESHOLD_DAYS;
    const chunkEstimate =
        days !== null && days > 0 ? Math.max(1, Math.ceil(days / ESTIMATED_CHUNK_DAYS)) : 0;
    const canContinue = hasBothDates && !isRangeInvalid && !isScopeInvalid;
    const canSubmit = canContinue && (!isExpensiveRange || expensiveConfirmed);
    const selectedDatasetKeys = datasetChoices
        .filter((choice) => selectedDatasetChoiceIds.includes(choice.id))
        .flatMap((choice) => choice.datasetKeys);
    const selectedSourceNames = sources
        .filter((source) => selectedSourceIds.includes(source.source_id))
        .map((source) => source.source_name);
    const selectedDatasetChoices = datasetChoices.filter((choice) =>
        selectedDatasetChoiceIds.includes(choice.id),
    );

    const resetConfirmation = () => setExpensiveConfirmed(false);
    const toggle = (values: string[], value: string): string[] =>
        values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

    const applySuggestedWindow = (window: SyncCoverageBackfillWindow) => {
        setSince(toDateInput(window.since));
        setBefore(toDateInput(window.before));
        setSourceMode(window.source_ids?.length ? "selected" : "all");
        setSelectedSourceIds(sourceIdsInInventory(window.source_ids, sources));
        setDatasetMode(window.dataset_keys?.length ? "selected" : "all");
        setScopedDatasetKeys(window.dataset_keys ?? []);
        setSelectedDatasetChoiceIds(
            choiceIdsForDatasetScope(
                buildDatasetChoices(datasets, window.dataset_keys),
                window.dataset_keys,
            ),
        );
        resetConfirmation();
    };

    const handleSubmit = () => {
        if (!canSubmit) return;
        setSubmitError(null);
        const selector = {
            since: toBoundary(since),
            before: toBoundary(before),
            ...(sourceMode === "selected" ? { source_ids: selectedSourceIds } : {}),
            ...(datasetMode === "selected" ? { dataset_keys: selectedDatasetKeys } : {}),
        };

        if (testMode) {
            setSubmittedSyncRunId("sample-run-gaps");
            setStep("result");
            return;
        }

        startTransition(async () => {
            const result = await triggerBackfill(configId, selector);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="backfill-wizard-title"
                tabIndex={-1}
                className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-(--card-stroke) bg-(--card) shadow-2xl focus:outline-none"
            >
                <div className="flex items-center justify-between border-b border-(--card-stroke) p-6">
                    <div>
                        <h2
                            id="backfill-wizard-title"
                            className="text-lg font-semibold text-foreground"
                        >
                            Run focused backfill
                        </h2>
                        <p className="mt-1 text-xs text-(--ink-muted)">
                            Step {step === "scope" ? 1 : step === "review" ? 2 : 3} of 3
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

                <div className="space-y-5 p-6">
                    {step === "scope" && (
                        <>
                            <p className="text-sm text-(--ink-muted)">
                                Choose the exact historical window and scope. This run does not
                                advance scheduled-sync watermarks.
                            </p>
                            {suggestedWindows?.length === 0 && (
                                <p
                                    role="status"
                                    className="rounded-lg border border-(--card-stroke) bg-(--card-70) p-3 text-sm text-(--ink-muted)"
                                >
                                    No server-suggested backfill window is available. Enter a manual
                                    date range and scope to continue.
                                </p>
                            )}
                            {suggestedWindows && suggestedWindows.length > 1 && (
                                <fieldset className="space-y-2 rounded-lg border border-(--card-stroke) p-4">
                                    <legend className="px-1 text-sm font-semibold text-foreground">
                                        Suggested exact windows
                                    </legend>
                                    <p className="text-xs text-(--ink-muted)">
                                        Choose one server-authorized window, or set a different
                                        exact scope below.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {suggestedWindows.map((window) => (
                                            <button
                                                key={`${window.since}-${window.before}-${window.dataset_keys?.join(",") ?? "all"}-${window.source_ids?.join(",") ?? "all"}`}
                                                type="button"
                                                onClick={() => applySuggestedWindow(window)}
                                                className="rounded-md border border-(--card-stroke) px-3 py-2 text-left text-sm text-foreground hover:border-(--accent)"
                                            >
                                                {windowLabel(window)}
                                            </button>
                                        ))}
                                    </div>
                                </fieldset>
                            )}
                            {suggestedWindows?.length === 1 && initialWindow && (
                                <p role="status" className="text-sm text-(--ink-muted)">
                                    The server-suggested window is selected. You can edit it before
                                    confirmation.
                                </p>
                            )}
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label
                                    className="text-sm font-medium text-(--ink-muted)"
                                    htmlFor="backfill-since"
                                >
                                    Since (inclusive)
                                    <input
                                        id="backfill-since"
                                        type="date"
                                        value={since}
                                        onChange={(event) => {
                                            setSince(event.target.value);
                                            resetConfirmation();
                                        }}
                                        aria-invalid={isRangeInvalid}
                                        aria-describedby={
                                            isRangeInvalid ? RANGE_ERROR_ID : undefined
                                        }
                                        className="mt-1.5 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                    />
                                </label>
                                <label
                                    className="text-sm font-medium text-(--ink-muted)"
                                    htmlFor="backfill-before"
                                >
                                    Before (exclusive)
                                    <input
                                        id="backfill-before"
                                        type="date"
                                        value={before}
                                        onChange={(event) => {
                                            setBefore(event.target.value);
                                            resetConfirmation();
                                        }}
                                        aria-invalid={isRangeInvalid}
                                        aria-describedby={
                                            isRangeInvalid ? RANGE_ERROR_ID : undefined
                                        }
                                        className="mt-1.5 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                    />
                                </label>
                            </div>
                            {isRangeInvalid && (
                                <p
                                    id={RANGE_ERROR_ID}
                                    role="alert"
                                    className="text-sm text-(--negative)"
                                >
                                    Since must be before the exclusive boundary.
                                </p>
                            )}

                            <fieldset className="space-y-3 rounded-lg border border-(--card-stroke) p-4">
                                <legend className="px-1 text-sm font-semibold text-foreground">
                                    Repository or source scope
                                </legend>
                                <label className="flex items-start gap-2 text-sm">
                                    <input
                                        type="radio"
                                        name="source-scope"
                                        checked={sourceMode === "all"}
                                        onChange={() => {
                                            setSourceMode("all");
                                            resetConfirmation();
                                        }}
                                        className="mt-0.5"
                                    />
                                    <span>
                                        <span className="block text-foreground">
                                            All enabled sources
                                        </span>
                                        <span className="text-xs text-(--ink-muted)">
                                            Date-only compatible scope; the server resolves enabled
                                            sources.
                                        </span>
                                    </span>
                                </label>
                                <label className="flex items-start gap-2 text-sm">
                                    <input
                                        type="radio"
                                        name="source-scope"
                                        checked={sourceMode === "selected"}
                                        onChange={() => {
                                            setSourceMode("selected");
                                            resetConfirmation();
                                        }}
                                        disabled={sources.length === 0}
                                        className="mt-0.5"
                                    />
                                    <span>
                                        <span className="block text-foreground">
                                            Choose specific sources
                                        </span>
                                        <span className="text-xs text-(--ink-muted)">
                                            {sources.length === 0
                                                ? "No authoritative source inventory is available."
                                                : "Only checked sources will run."}
                                        </span>
                                    </span>
                                </label>
                                {sourceMode === "selected" && (
                                    <div className="ml-6 grid gap-2 sm:grid-cols-2">
                                        {sources.map((source) => (
                                            <label
                                                key={source.source_id}
                                                className="flex items-center gap-2 text-sm text-foreground"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedSourceIds.includes(
                                                        source.source_id,
                                                    )}
                                                    onChange={() => {
                                                        setSelectedSourceIds((current) =>
                                                            toggle(current, source.source_id),
                                                        );
                                                        resetConfirmation();
                                                    }}
                                                />
                                                {source.source_name}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </fieldset>

                            <fieldset className="space-y-3 rounded-lg border border-(--card-stroke) p-4">
                                <legend className="px-1 text-sm font-semibold text-foreground">
                                    Provider unit or dataset scope
                                </legend>
                                <label className="flex items-start gap-2 text-sm">
                                    <input
                                        type="radio"
                                        name="dataset-scope"
                                        checked={datasetMode === "all"}
                                        onChange={() => {
                                            setDatasetMode("all");
                                            resetConfirmation();
                                        }}
                                        className="mt-0.5"
                                    />
                                    <span>
                                        <span className="block text-foreground">
                                            All enabled datasets
                                        </span>
                                        <span className="text-xs text-(--ink-muted)">
                                            The server resolves the complete enabled dataset scope.
                                        </span>
                                    </span>
                                </label>
                                <label className="flex items-start gap-2 text-sm">
                                    <input
                                        type="radio"
                                        name="dataset-scope"
                                        checked={datasetMode === "selected"}
                                        onChange={() => {
                                            setDatasetMode("selected");
                                            resetConfirmation();
                                        }}
                                        disabled={datasetChoices.length === 0}
                                        className="mt-0.5"
                                    />
                                    <span>
                                        <span className="block text-foreground">
                                            Choose specific datasets
                                        </span>
                                        <span className="text-xs text-(--ink-muted)">
                                            {datasetChoices.length === 0
                                                ? "No authoritative dataset inventory is available."
                                                : "Canonical work-item datasets are grouped into one execution family."}
                                        </span>
                                    </span>
                                </label>
                                {datasetMode === "selected" && (
                                    <div className="ml-6 space-y-2">
                                        {datasetChoices.map((choice) => (
                                            <label
                                                key={choice.id}
                                                className="flex items-start gap-2 text-sm text-foreground"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedDatasetChoiceIds.includes(
                                                        choice.id,
                                                    )}
                                                    onChange={() => {
                                                        setSelectedDatasetChoiceIds((current) =>
                                                            toggle(current, choice.id),
                                                        );
                                                        resetConfirmation();
                                                    }}
                                                    className="mt-0.5"
                                                />
                                                <span>
                                                    {choice.label}
                                                    {choice.datasetKeys.length > 1 && (
                                                        <span className="block text-xs text-(--ink-muted)">
                                                            Affects:{" "}
                                                            {choice.datasetKeys
                                                                .map(datasetLabel)
                                                                .join(", ")}
                                                        </span>
                                                    )}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </fieldset>

                            {isScopeInvalid && (
                                <p
                                    id={SCOPE_ERROR_ID}
                                    role="alert"
                                    className="text-sm text-(--negative)"
                                >
                                    Choose at least one item in every focused scope, or switch that
                                    scope to all enabled.
                                </p>
                            )}
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={onCloseAction}
                                    className="rounded-md border border-(--card-stroke) px-4 py-2 text-sm"
                                >
                                    {CTA_LABELS.cancel}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStep("review")}
                                    disabled={!canContinue}
                                    aria-describedby={isScopeInvalid ? SCOPE_ERROR_ID : undefined}
                                    className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
                                >
                                    {CTA_LABELS.continueStep}
                                </button>
                            </div>
                        </>
                    )}

                    {step === "review" && (
                        <>
                            <p className="text-sm text-(--ink-muted)">
                                Review the exact bounded selector. Nothing outside this scope will
                                be requested.
                            </p>
                            <dl className="grid gap-4 rounded-lg border border-(--card-stroke) p-4 text-sm sm:grid-cols-2">
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wider text-(--ink-muted)">
                                        Window
                                    </dt>
                                    <dd className="mt-1 text-foreground">
                                        {since} inclusive → {before} exclusive
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wider text-(--ink-muted)">
                                        Estimated chunks
                                    </dt>
                                    <dd className="mt-1 text-foreground">
                                        ~{chunkEstimate} per selected unit (estimate)
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wider text-(--ink-muted)">
                                        Sources
                                    </dt>
                                    <dd className="mt-1 text-foreground">
                                        {sourceMode === "all"
                                            ? "All enabled sources"
                                            : selectedSourceNames.join(", ")}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wider text-(--ink-muted)">
                                        Datasets
                                    </dt>
                                    <dd className="mt-1 text-foreground">
                                        {datasetMode === "all"
                                            ? "All enabled datasets"
                                            : selectedDatasetChoices
                                                  .map((choice) => choice.label)
                                                  .join(", ")}
                                    </dd>
                                </div>
                            </dl>
                            {datasetMode === "selected" &&
                                selectedDatasetKeys.length > selectedDatasetChoices.length && (
                                    <p className="text-xs text-(--ink-muted)">
                                        Canonical work-item family affects:{" "}
                                        {selectedDatasetKeys.map(datasetLabel).join(", ")}.
                                    </p>
                                )}
                            {isExpensiveRange && (
                                <div
                                    role="alert"
                                    className="space-y-3 rounded-lg border border-(--caution)/30 bg-(--caution)/15 p-4"
                                >
                                    <p className="text-sm font-medium text-(--caution)">
                                        This range spans {days} days, more than{" "}
                                        {EXPENSIVE_RANGE_THRESHOLD_DAYS}. Large backfills can take a
                                        long time and consume significant sync capacity.
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
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setStep("scope")}
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
                                Backfill started for the reviewed scope. Progress will appear on
                                this page.
                            </p>
                            {submittedSyncRunId && (
                                <Link
                                    href={`/org/admin/sync/${configId}/runs/${submittedSyncRunId}`}
                                    className="inline-block text-sm text-(--accent) hover:underline"
                                >
                                    {CTA_LABELS.viewRun}
                                </Link>
                            )}
                            <div className="flex justify-end pt-2">
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
