"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { triggerBackfill } from "@/lib/admin/server";
import type {
    BackfillSelector,
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
    /** Several exact scopes selected from coverage. Each remains a separate request. */
    initialWindows?: SyncCoverageBackfillWindow[];
    /** Present empty means Ops has no exact suggestion for this coverage state. */
    suggestedWindows?: SyncCoverageBackfillWindow[];
    datasets: SyncCoverageDataset[];
    sources: SyncCoverageSource[];
    testMode?: boolean;
}

interface SubmissionOutcome {
    label: string;
    syncRunId: string | null;
    error: string | null;
}

function startedBackfillLabel(count: number): string {
    return count === 1 ? "1 backfill started" : `${count} backfills started`;
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

function exactWindowDays(window: SyncCoverageBackfillWindow): number | null {
    const since = new Date(window.since);
    const before = new Date(window.before);
    if (Number.isNaN(since.getTime()) || Number.isNaN(before.getTime())) return null;
    return (before.getTime() - since.getTime()) / 86_400_000;
}

function toBoundary(value: string): string {
    return `${value}T00:00:00.000Z`;
}

function toDateInput(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
}

/**
 * Render a window boundary for display, keeping the time when there is one.
 *
 * Coverage gaps start whenever a sync ran, so a boundary is rarely UTC
 * midnight and a window can sit inside a single day (CHAOS-3915). Rendering
 * date-only would print "2026-08-08 to 2026-08-08", which reads like the
 * zero-width window bug rather than a real two-hour gap.
 */
function boundaryLabel(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const iso = date.toISOString();
    const day = iso.slice(0, 10);
    return iso.endsWith("T00:00:00.000Z") ? day : `${day} ${iso.slice(11, 16)}Z`;
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
    // An empty array is not nullish, so `??` alone leaves the scope blank and
    // the label ends in a dangling separator. The server sends `[]` for an
    // unscoped window, which means "all datasets" just as a missing key does.
    const datasetScope = window.dataset_keys?.length
        ? window.dataset_keys.join(", ")
        : "all datasets";
    return `${boundaryLabel(window.since)} to ${boundaryLabel(window.before)} · ${datasetScope}`;
}

function backfillWindowKey(window: SyncCoverageBackfillWindow): string {
    return [
        window.since,
        window.before,
        [...(window.dataset_keys ?? [])].sort().join(","),
        [...(window.source_ids ?? [])].sort().join(","),
    ].join("|");
}

/**
 * Coerce a coverage-window boundary into a timezone-aware ISO instant.
 *
 * The backfill endpoint validates its selector as an `AwareDatetime` and
 * rejects a naive value with a `timezone_aware` 422. Server-sent windows are
 * echoed back here verbatim, so a server that serialises a boundary without an
 * offset (a version-1 coverage projection stored bare calendar dates) produces
 * a suggestion the server then refuses. Every stored boundary is UTC midnight.
 *
 * Deliberately NOT a `new Date(value).toISOString()` round-trip: JS parses an
 * offset-less `YYYY-MM-DDTHH:mm:ss` as local time, which would shift the
 * boundary by the viewer's UTC offset and backfill the wrong day.
 */
function toAwareBoundary(value: string): string {
    // A bare calendar date or an offset-less instant is UTC by
    // construction on the server; make that explicit so the
    // selector satisfies AwareDatetime.
    if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return value;
    return value.includes("T") ? `${value}Z` : `${value}T00:00:00.000Z`;
}

function selectorForExactWindow(window: SyncCoverageBackfillWindow): BackfillSelector {
    return {
        since: toAwareBoundary(window.since),
        before: toAwareBoundary(window.before),
        ...(window.source_ids?.length ? { source_ids: window.source_ids } : {}),
        ...(window.dataset_keys?.length ? { dataset_keys: window.dataset_keys } : {}),
    };
}

export function BackfillWizard({
    configId,
    onCloseAction,
    initialWindow,
    initialWindows,
    suggestedWindows,
    datasets,
    sources,
    testMode = false,
}: BackfillWizardProps) {
    const router = useRouter();
    const seededWindows = useMemo(
        () =>
            initialWindows && initialWindows.length > 0
                ? initialWindows
                : initialWindow
                  ? [initialWindow]
                  : [],
        [initialWindow, initialWindows],
    );
    const selectableWindows = useMemo(() => {
        const byKey = new Map<string, SyncCoverageBackfillWindow>();
        for (const window of [...(suggestedWindows ?? []), ...seededWindows]) {
            byKey.set(backfillWindowKey(window), window);
        }
        return [...byKey.values()];
    }, [seededWindows, suggestedWindows]);
    const singleInitialWindow = seededWindows.length === 1 ? seededWindows[0] : undefined;
    const [selectedWindowKeys, setSelectedWindowKeys] = useState<string[]>(() =>
        seededWindows.map(backfillWindowKey),
    );
    const [scopedDatasetKeys, setScopedDatasetKeys] = useState<string[]>(
        singleInitialWindow?.dataset_keys ?? [],
    );
    const datasetChoices = useMemo(
        () => buildDatasetChoices(datasets, scopedDatasetKeys),
        [datasets, scopedDatasetKeys],
    );
    const [step, setStep] = useState<WizardStep>("scope");
    const [since, setSince] = useState(() =>
        singleInitialWindow ? toDateInput(singleInitialWindow.since) : "",
    );
    const [before, setBefore] = useState(() =>
        singleInitialWindow ? toDateInput(singleInitialWindow.before) : "",
    );
    const [sourceMode, setSourceMode] = useState<ScopeMode>(() =>
        singleInitialWindow?.source_ids?.length ? "selected" : "all",
    );
    const [datasetMode, setDatasetMode] = useState<ScopeMode>(() =>
        singleInitialWindow?.dataset_keys?.length ? "selected" : "all",
    );
    const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(() =>
        sourceIdsInInventory(singleInitialWindow?.source_ids, sources),
    );
    const [selectedDatasetChoiceIds, setSelectedDatasetChoiceIds] = useState<string[]>(() =>
        choiceIdsForDatasetScope(datasetChoices, singleInitialWindow?.dataset_keys),
    );
    const [expensiveConfirmed, setExpensiveConfirmed] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [submissionOutcomes, setSubmissionOutcomes] = useState<SubmissionOutcome[]>([]);
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

    const selectedExactWindows = selectableWindows.filter((window) =>
        selectedWindowKeys.includes(backfillWindowKey(window)),
    );
    const isExactBatch = selectedExactWindows.length > 1;
    const days = rangeDays(since, before);
    const hasBothDates = Boolean(since) && Boolean(before);
    const isRangeInvalid = hasBothDates && days !== null && days <= 0;
    const sourceSelectionInvalid = sourceMode === "selected" && selectedSourceIds.length === 0;
    const datasetSelectionInvalid =
        datasetMode === "selected" && selectedDatasetChoiceIds.length === 0;
    const manualScopeInvalid = sourceSelectionInvalid || datasetSelectionInvalid;
    const exactSelectionInvalid = selectedExactWindows.some((window) => {
        const windowDays = exactWindowDays(window);
        const availableSourceIds = sourceIdsInInventory(window.source_ids, sources);
        const availableDatasetChoices = choiceIdsForDatasetScope(
            buildDatasetChoices(datasets, window.dataset_keys),
            window.dataset_keys,
        );
        return (
            windowDays === null ||
            windowDays <= 0 ||
            (window.source_ids !== undefined &&
                availableSourceIds.length !== window.source_ids.length) ||
            (window.dataset_keys !== undefined &&
                window.dataset_keys.length > 0 &&
                availableDatasetChoices.length === 0)
        );
    });
    const isScopeInvalid =
        selectedExactWindows.length > 0 ? exactSelectionInvalid : manualScopeInvalid;
    const isExpensiveRange =
        selectedExactWindows.length > 0
            ? selectedExactWindows.some((window) => {
                  const windowDays = exactWindowDays(window);
                  return windowDays !== null && windowDays > EXPENSIVE_RANGE_THRESHOLD_DAYS;
              })
            : days !== null && days > EXPENSIVE_RANGE_THRESHOLD_DAYS;
    const chunkEstimate =
        days !== null && days > 0 ? Math.max(1, Math.ceil(days / ESTIMATED_CHUNK_DAYS)) : 0;
    const canContinue =
        selectedExactWindows.length > 0
            ? !exactSelectionInvalid
            : hasBothDates && !isRangeInvalid && !manualScopeInvalid;
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
    const successfulOutcomes = submissionOutcomes.filter((outcome) => outcome.error === null);
    const failedOutcomes = submissionOutcomes.filter((outcome) => outcome.error !== null);

    const resetConfirmation = () => setExpensiveConfirmed(false);
    const beginManualEdit = () => {
        setSelectedWindowKeys([]);
        resetConfirmation();
    };
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

    const toggleSuggestedWindow = (window: SyncCoverageBackfillWindow) => {
        const key = backfillWindowKey(window);
        const nextKeys = selectedWindowKeys.includes(key)
            ? selectedWindowKeys.filter((value) => value !== key)
            : [...selectedWindowKeys, key];
        setSelectedWindowKeys(nextKeys);
        const nextWindows = selectableWindows.filter((candidate) =>
            nextKeys.includes(backfillWindowKey(candidate)),
        );
        if (nextWindows.length === 1) applySuggestedWindow(nextWindows[0]);
        resetConfirmation();
    };

    const handleSubmit = () => {
        if (!canSubmit) return;
        const selectors: BackfillSelector[] =
            selectedExactWindows.length > 0
                ? selectedExactWindows.map(selectorForExactWindow)
                : [
                      {
                          since: toBoundary(since),
                          before: toBoundary(before),
                          ...(sourceMode === "selected" ? { source_ids: selectedSourceIds } : {}),
                          ...(datasetMode === "selected"
                              ? { dataset_keys: selectedDatasetKeys }
                              : {}),
                      },
                  ];
        const labels =
            selectedExactWindows.length > 0
                ? selectedExactWindows.map(windowLabel)
                : [`${since} to ${before}`];

        if (testMode) {
            setSubmissionOutcomes(
                selectors.map((_, index) => ({
                    label: labels[index],
                    syncRunId:
                        selectors.length === 1 ? "sample-run-gaps" : `sample-run-gaps-${index + 1}`,
                    error: null,
                })),
            );
            setStep("result");
            return;
        }

        startTransition(async () => {
            const outcomes: SubmissionOutcome[] = [];
            for (const [index, selector] of selectors.entries()) {
                try {
                    const result = await triggerBackfill(configId, selector);
                    outcomes.push({
                        label: labels[index],
                        syncRunId: result.data?.sync_run_id ?? null,
                        error:
                            result.error || !result.data
                                ? (result.error ?? "Failed to start backfill")
                                : null,
                    });
                } catch {
                    outcomes.push({
                        label: labels[index],
                        syncRunId: null,
                        error: "Failed to start backfill",
                    });
                }
            }
            const startedCount = outcomes.filter((outcome) => outcome.error === null).length;
            const failedCount = outcomes.length - startedCount;
            if (failedCount === 0) {
                toast.success(
                    startedCount === 1 ? "Backfill started" : startedBackfillLabel(startedCount),
                );
            } else if (startedCount === 0) {
                toast.error("No backfills could be started");
            } else {
                toast.warning(`${startedBackfillLabel(startedCount)}; ${failedCount} failed`);
            }
            setSubmissionOutcomes(outcomes);
            setStep("result");
            if (startedCount > 0) router.refresh();
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
                            {suggestedWindows && suggestedWindows.length > 0 && (
                                <fieldset className="space-y-2 rounded-lg border border-(--card-stroke) p-4">
                                    <legend className="px-1 text-sm font-semibold text-foreground">
                                        Suggested exact windows
                                    </legend>
                                    <p className="text-xs text-(--ink-muted)">
                                        Select one or more server-authorized windows. Each selected
                                        window keeps its own dates, sources, and datasets.
                                    </p>
                                    <div className="space-y-2">
                                        {suggestedWindows.map((window) => (
                                            <label
                                                key={backfillWindowKey(window)}
                                                className="flex items-start gap-2 rounded-md border border-(--card-stroke) px-3 py-2 text-sm text-foreground hover:border-(--accent)"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedWindowKeys.includes(
                                                        backfillWindowKey(window),
                                                    )}
                                                    onChange={() => toggleSuggestedWindow(window)}
                                                    className="mt-0.5"
                                                />
                                                <span>{windowLabel(window)}</span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            )}
                            {selectedExactWindows.length > 0 && (
                                <p
                                    role="status"
                                    className="rounded-lg border border-(--accent)/30 bg-(--accent)/10 p-3 text-sm text-foreground"
                                >
                                    {selectedExactWindows.length === 1
                                        ? "1 exact window selected. Its repositories and datasets are set below; editing them switches to a manual selector."
                                        : `${selectedExactWindows.length} exact windows selected. Each window will run with its server-set repositories and datasets.`}
                                </p>
                            )}
                            <div hidden={isExactBatch} className="grid gap-3 sm:grid-cols-2">
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
                                            beginManualEdit();
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
                                            beginManualEdit();
                                        }}
                                        aria-invalid={isRangeInvalid}
                                        aria-describedby={
                                            isRangeInvalid ? RANGE_ERROR_ID : undefined
                                        }
                                        className="mt-1.5 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                                    />
                                </label>
                            </div>
                            {!isExactBatch && isRangeInvalid && (
                                <p
                                    id={RANGE_ERROR_ID}
                                    role="alert"
                                    className="text-sm text-(--negative)"
                                >
                                    Since must be before the exclusive boundary.
                                </p>
                            )}

                            <fieldset
                                hidden={isExactBatch}
                                className="space-y-3 rounded-lg border border-(--card-stroke) p-4"
                            >
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
                                            beginManualEdit();
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
                                            beginManualEdit();
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
                                                        beginManualEdit();
                                                    }}
                                                />
                                                {source.source_name}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </fieldset>

                            <fieldset
                                hidden={isExactBatch}
                                className="space-y-3 rounded-lg border border-(--card-stroke) p-4"
                            >
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
                                            beginManualEdit();
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
                                            beginManualEdit();
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
                                                        beginManualEdit();
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
                                    {selectedExactWindows.length > 0
                                        ? "One selected server window is not available in the current source or dataset inventory."
                                        : "Choose at least one item in every focused scope, or switch that scope to all enabled."}
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
                            {isExactBatch ? (
                                <ol className="space-y-3">
                                    {selectedExactWindows.map((window, index) => {
                                        const windowDays = exactWindowDays(window);
                                        return (
                                            <li
                                                key={backfillWindowKey(window)}
                                                className="rounded-lg border border-(--card-stroke) p-4 text-sm"
                                            >
                                                <p className="font-medium text-foreground">
                                                    Window {index + 1}: {windowLabel(window)}
                                                </p>
                                                <p className="mt-1 text-(--ink-muted)">
                                                    Sources:{" "}
                                                    {window.source_ids?.length
                                                        ? window.source_ids
                                                              .map(
                                                                  (id) =>
                                                                      sources.find(
                                                                          (source) =>
                                                                              source.source_id ===
                                                                              id,
                                                                      )?.source_name ?? id,
                                                              )
                                                              .join(", ")
                                                        : "All enabled sources"}
                                                </p>
                                                <p className="text-(--ink-muted)">
                                                    Datasets:{" "}
                                                    {window.dataset_keys?.length
                                                        ? window.dataset_keys
                                                              .map(datasetLabel)
                                                              .join(", ")
                                                        : "All enabled datasets"}
                                                </p>
                                                <p className="text-xs text-(--ink-muted)">
                                                    ~
                                                    {windowDays && windowDays > 0
                                                        ? Math.max(
                                                              1,
                                                              Math.ceil(
                                                                  windowDays / ESTIMATED_CHUNK_DAYS,
                                                              ),
                                                          )
                                                        : 0}{" "}
                                                    chunks per selected unit (estimate)
                                                </p>
                                            </li>
                                        );
                                    })}
                                </ol>
                            ) : (
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
                            )}
                            {!isExactBatch &&
                                datasetMode === "selected" &&
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
                                        {isExactBatch
                                            ? `One or more selected windows span more than ${EXPENSIVE_RANGE_THRESHOLD_DAYS} days.`
                                            : `This range spans ${days} days, more than ${EXPENSIVE_RANGE_THRESHOLD_DAYS}.`}{" "}
                                        Large backfills can take a long time and consume significant
                                        sync capacity.
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
                                    {isPending
                                        ? "Starting..."
                                        : isExactBatch
                                          ? `Run ${selectedExactWindows.length} backfills`
                                          : CTA_LABELS.runBackfill}
                                </button>
                            </div>
                        </>
                    )}

                    {step === "result" && (
                        <>
                            <p className="text-sm text-foreground">
                                {successfulOutcomes.length === 1 && failedOutcomes.length === 0
                                    ? "Backfill started for the reviewed scope. Progress will appear on this page."
                                    : successfulOutcomes.length > 0
                                      ? `${startedBackfillLabel(successfulOutcomes.length)}${failedOutcomes.length > 0 ? `; ${failedOutcomes.length} failed` : ""}. Progress will appear on this page.`
                                      : "No backfills could be started."}
                            </p>
                            <ul className="space-y-2">
                                {submissionOutcomes.map((outcome, index) => (
                                    <li
                                        key={`${outcome.label}-${index}`}
                                        className="rounded-lg border border-(--card-stroke) p-3 text-sm"
                                    >
                                        <p className="text-foreground">{outcome.label}</p>
                                        {outcome.error ? (
                                            <p role="alert" className="mt-1 text-(--negative)">
                                                {outcome.error}
                                            </p>
                                        ) : outcome.syncRunId ? (
                                            <Link
                                                href={`/org/admin/sync/${configId}/runs/${outcome.syncRunId}`}
                                                className="mt-1 inline-block text-(--accent) hover:underline"
                                            >
                                                {CTA_LABELS.viewRun}
                                            </Link>
                                        ) : (
                                            <p className="mt-1 text-(--ink-muted)">
                                                Backfill accepted; refresh this page to view
                                                progress.
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ul>
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
