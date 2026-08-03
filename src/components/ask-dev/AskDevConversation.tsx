"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { DevProgressState } from "@/lib/dev/client";
import { CTA_LABELS } from "@/lib/design/cta";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";
import { formatDateUTC } from "@/lib/formatters";
import { runtimeConfig } from "@/lib/runtimeConfig";
import { DataState } from "@/components/ui/DataState";

import { AskDevAnswer } from "./AskDevAnswer";
import { useAskDev } from "./AskDevProvider";

function platformAllowanceGuidance(
    error: ReturnType<typeof useAskDev>["stream"]["error"],
): string | null {
    if (!error || !["rate_limited", "cost_limit_reached"].includes(error.code)) return null;
    if (!error.limit_reset_at) {
        return "Retrying immediately will not help. New platform-backed runs resume after the monthly allowance resets.";
    }
    const reset = new Date(error.limit_reset_at);
    if (Number.isNaN(reset.getTime())) {
        return "Retrying immediately will not help. New platform-backed runs resume after the monthly allowance resets.";
    }
    const resetLabel = new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
    }).format(reset);
    return `Retrying before ${resetLabel} will not help. New platform-backed runs resume at that reset.`;
}

/**
 * CHAOS-3339. Kept separate from `platformAllowanceGuidance` because the two
 * treat `retryable` oppositely — see the call site.
 *
 * Naming the provider as the faulting side is safe to state unconditionally.
 * The retry sentence is not: it is READ OFF `error.retryable` rather than
 * assumed, so this copy cannot contradict the retry button beside it, which is
 * gated on the same field. That matters because web pins ops' contracts and
 * re-pins later, so the two deploy independently: hard-coding "retrying cannot
 * help" here would start lying the moment ops decided this fault was
 * recoverable, and would take the only retry affordance with it.
 *
 * Today ops emits it non-retryable, which is why the futile wording is the one
 * users will actually see. The sole raise site (the
 * `_SequentialToolContractViolation` handler in
 * `llm/agent/openai_compatible.py`) constructs `AgentProviderError` without a
 * `retryable` argument, taking the class default `retryable: bool = False`
 * (`llm/agent/errors.py`), and `DevOrchestrator._provider_error`
 * (`api/dev/orchestrator.py`) projects it straight through as
 * `retryable=exc.retryable`. Ops treats it as a standing capability defect
 * elsewhere too: its remediation asks an operator to confirm the endpoint
 * honours `parallel_tool_calls=false` (`api/dev/contracts.py`), and readiness
 * maps the code to the `unsupported_model` role state
 * (`llm/agent/readiness.py`). An earlier revision of this copy said "retrying
 * may help", which contradicted all of that.
 */
function providerContractGuidance(
    error: ReturnType<typeof useAskDev>["stream"]["error"],
): string | null {
    if (error?.code !== "provider_contract_violation") return null;
    const fault =
        "The AI provider returned a response that violated its contract. This is a provider-side fault, not a problem with your question.";
    if (error.retryable) return fault;
    return `${fault} Retrying will not help until an administrator corrects the configured model or endpoint.`;
}

/**
 * Sanctioned copy for every pinned progress phase, TOTAL over
 * `DevProgressState`.
 *
 * The `?? "Investigating"` fallback below is not a compatibility path: every
 * stream event is validated against the pinned schema in client.ts
 * (`assertStreamEvent`) before it reaches this state, so a phase the pin does
 * not know is rejected at the boundary and never renders. Totality here is
 * what keeps the fallback genuinely unreachable — while this was
 * `Record<string, string>`, a re-pin could add a phase that quietly rendered
 * as the generic label instead of failing anything.
 */
export const PROGRESS_LABELS: Record<DevProgressState, string> = {
    resolving_scope: "Resolving the committed scope",
    checking_status: "Checking current status",
    querying_metrics: "Querying registered metrics",
    checking_dependencies: "Tracing dependencies",
    checking_evidence: "Checking supporting evidence",
    checking_data_freshness: "Checking data freshness",
    preparing_answer: "Preparing an evidence-backed answer",
};

export function AskDevConversation({
    compact = false,
    showHistory = false,
}: {
    compact?: boolean;
    showHistory?: boolean;
}) {
    const {
        availability,
        committedScopeLabel,
        cancelRun,
        clearProposedContext,
        conversations,
        deleteConversation,
        historyError,
        historyLoading,
        loadHistory,
        openConversation,
        orgId,
        proposedContext,
        proposedQuestions,
        proposedScope,
        proposedScopeLabel,
        renameConversation,
        retryLastQuestion,
        startNewConversation,
        stream,
        submitQuestion,
        transcript,
    } = useAskDev();
    const [draft, setDraft] = useState("");
    const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState("");
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [historyActionError, setHistoryActionError] = useState<string | null>(null);
    const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
    const composerId = useId();
    const historyPanelId = useId();
    const transcriptEnd = useRef<HTMLDivElement>(null);
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    // Declared here (ahead of the effects below that reference it) rather than
    // inline where it was originally introduced, so the org-switch reset
    // effect can clear it too — see that effect's comment (CHAOS-3215).
    const runInProgress = useRef(false);
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const filters = useMemo(() => decodeFilter(searchParams.get("f")), [searchParams]);
    // Only the allowance case overrides the server's `retryable` and replaces
    // the retry button: an exhausted monthly platform allowance is a
    // product-side fact that ops' per-error `retryable` does not model (it
    // reports the provider call itself as retryable). Provider-contract
    // guidance instead derives its retry sentence from `error.retryable`, so
    // it never needs to override the button to stay consistent with it — see
    // providerContractGuidance.
    const allowanceGuidance = platformAllowanceGuidance(stream.error);
    const errorGuidance = allowanceGuidance ?? providerContractGuidance(stream.error);
    // "Powered by Context Fabric" is the sanctioned relationship framing
    // (CHAOS-3215): Ask Dev is the customer interaction layer, Context
    // Fabric Validation is a separate platform-administrator diagnostic
    // surface. This links out to the customer doc for that relationship —
    // never to the admin-only validation surface.
    const askDevDocsHref = `${runtimeConfig.docsUrl()}/use/ai-workflows/`;

    useEffect(() => {
        if (showHistory && availability.state === "ready") void loadHistory();
    }, [availability.state, loadHistory, showHistory]);

    // This conversation subtree owns its own draft/history-edit UI state, so
    // the provider's organization-switch reset (which clears transcript,
    // conversationId, etc. synchronously at render time) cannot reach it. An
    // unsent draft typed under one organization must not persist after
    // switching to another (CHAOS-3215 H1). `orgId` is exposed on context for
    // exactly this purpose. This mirrors the provider's own render-time
    // "adjusting state while rendering" reset (see AskDevProvider.tsx) rather
    // than a `useEffect`, for the same reason: a passive effect fires only
    // after the previous organization's draft has already been painted once.
    const [previousOrgId, setPreviousOrgId] = useState(orgId);
    if (orgId !== previousOrgId) {
        setPreviousOrgId(orgId);
        setDraft("");
        setEditingConversationId(null);
        setEditingTitle("");
        setPendingDeleteId(null);
        setHistoryActionError(null);
        setHistoryPanelOpen(false);
    }

    // `runInProgress` is a ref, not visible state, so clearing it does not
    // need (and per the project's lint rules, must not use) the render-time
    // escape hatch above — a plain effect is fine here, unlike the setState
    // calls above it.
    useEffect(() => {
        runInProgress.current = false;
    }, [orgId]);

    useEffect(() => {
        transcriptEnd.current?.scrollIntoView({ block: "nearest" });
    }, [stream.delta, stream.phase, transcript]);

    // The rAF focus-move callbacks below bail if the user has moved on to
    // something else by the time they fire — either the composer (typing the
    // next question) or the conversation-rename input (mid-edit of a saved
    // title while a run streams in the background). Stealing focus from
    // either would corrupt what the user is doing (CHAOS-3215 L2 / M-rename).
    const isUserActivelyEditingElsewhere = () =>
        document.activeElement === composerRef.current ||
        document.activeElement === renameInputRef.current;

    // Move keyboard focus to a newly-completed answer (or to the terminal
    // failure alert) once a run that was actually running reaches a terminal
    // state — mirrors AskDevAnswer's focusDetail() pattern (requestAnimationFrame
    // + .focus() on a tabIndex={-1} element). Split into two effects because the
    // "answer.completed" stream event (which flips stream.phase) and the actual
    // transcript push happen on different renders: a single effect keyed on both
    // dependencies would already have advanced its "was running" tracking ref
    // past "running" by the time the transcript update it needs to react to
    // arrives. `runInProgress` bridges that gap. Reopening a saved conversation
    // never sets `runInProgress`, so it never steals focus (CHAOS-3215 L2).
    useEffect(() => {
        if (stream.phase === "running") {
            runInProgress.current = true;
            return;
        }
        if (!runInProgress.current) return;
        if (stream.phase === "idle") {
            // The run was superseded (an organization switch or "New
            // conversation") rather than reaching a terminal state of its
            // own — clear tracking without moving focus, otherwise a later,
            // unrelated transcript-open could incorrectly steal focus by
            // satisfying the effect below (CHAOS-3215 M-runInProgress).
            runInProgress.current = false;
            return;
        }
        if (stream.phase !== "failed") return;
        runInProgress.current = false;
        requestAnimationFrame(() => {
            if (isUserActivelyEditingElsewhere()) return;
            document.getElementById("ask-dev-run-failed")?.focus({ preventScroll: true });
        });
    }, [stream.phase]);

    useEffect(() => {
        if (!runInProgress.current) return;
        const lastEntry = transcript[transcript.length - 1];
        if (!lastEntry || lastEntry.role !== "assistant") return;
        runInProgress.current = false;
        const answerId = lastEntry.answer.answer_id;
        requestAnimationFrame(() => {
            if (isUserActivelyEditingElsewhere()) return;
            document.getElementById(`ask-dev-answer-${answerId}`)?.focus({ preventScroll: true });
        });
    }, [transcript]);

    const submit = async () => {
        const question = draft.trim();
        if (!question) return;
        setDraft("");
        await submitQuestion(question);
    };

    const setComparisonDays = (compareDays: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set(
            "f",
            encodeFilterParam({
                ...filters,
                time: { ...filters.time, compare_days: compareDays },
            }),
        );
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const saveConversationTitle = async (conversationId: string) => {
        setHistoryActionError(null);
        try {
            await renameConversation(conversationId, editingTitle);
            setEditingConversationId(null);
        } catch (caught) {
            setHistoryActionError(
                caught instanceof Error ? caught.message : "The conversation could not be renamed.",
            );
        }
    };

    const removeConversation = async (conversationId: string) => {
        if (pendingDeleteId !== conversationId) {
            setPendingDeleteId(conversationId);
            return;
        }
        setHistoryActionError(null);
        try {
            await deleteConversation(conversationId);
            setPendingDeleteId(null);
        } catch (caught) {
            setHistoryActionError(
                caught instanceof Error ? caught.message : "The conversation could not be deleted.",
            );
        }
    };

    if (availability.state === "loading") {
        return (
            <DataState
                variant="loading"
                title="Checking Ask Dev availability…"
                className="flex-1 p-6"
            />
        );
    }
    if (availability.state === "disabled") {
        return (
            <DataState
                variant="source-unsupported"
                title="Ask Dev is currently unavailable"
                description="Ask Dev has been disabled for this organization. No investigation was started."
                className="flex-1 p-6"
            />
        );
    }
    if (availability.state === "not_ready") {
        return (
            <DataState
                variant="detector-unavailable"
                title="Ask Dev needs administrator attention"
                description={availability.safeReason}
                className="flex-1 p-6"
            />
        );
    }
    if (availability.state === "error") {
        return (
            <DataState
                variant="error"
                title="Ask Dev availability could not be confirmed"
                message={availability.safeReason}
                className="flex-1 p-6"
            />
        );
    }

    return (
        <div
            // Base `flex-col` stacks the mobile toggle bar, the (conditionally
            // shown) history aside, and the conversation column vertically —
            // without it these were unstyled row siblings below `lg`, so a
            // narrow viewport could squeeze/collapse the primary workspace.
            // `lg:grid` replaces that stacked layout with the two-column
            // desktop layout (CHAOS-3215 M-mobile-layout).
            className={`flex min-h-0 flex-1 flex-col ${showHistory ? "lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]" : ""}`}
        >
            {showHistory ? (
                <div className="border-b border-(--border) bg-(--surface)/65 px-4 py-2 lg:hidden">
                    <button
                        type="button"
                        aria-expanded={historyPanelOpen}
                        aria-controls={historyPanelId}
                        onClick={() => setHistoryPanelOpen((open) => !open)}
                        className="rounded-(--radius-sm) border border-(--border) px-2.5 py-1.5 text-xs font-medium text-(--text-secondary) transition hover:border-(--accent)/45 hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                    >
                        {historyPanelOpen
                            ? CTA_LABELS.hideAskDevHistory
                            : CTA_LABELS.showAskDevHistory}
                    </button>
                </div>
            ) : null}
            {showHistory ? (
                <aside
                    id={historyPanelId}
                    className={`${historyPanelOpen ? "block" : "hidden"} border-r border-(--border) bg-(--surface)/65 p-4 lg:block`}
                    aria-label="Ask Dev history"
                >
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-label-caps text-(--text-muted)">Conversations</h2>
                        <button
                            type="button"
                            onClick={startNewConversation}
                            className="rounded-(--radius-sm) border border-(--border) px-2.5 py-1.5 text-xs font-medium text-(--text-secondary) transition hover:border-(--accent)/45 hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                        >
                            {CTA_LABELS.newAskDevConversation}
                        </button>
                    </div>
                    {historyLoading ? (
                        <p role="status" className="mt-4 text-sm text-(--text-muted)">
                            Loading history…
                        </p>
                    ) : historyError ? (
                        <div className="mt-4 space-y-2 text-sm text-(--negative)">
                            <p>{historyError}</p>
                            <button
                                type="button"
                                onClick={() => void loadHistory()}
                                className="font-medium underline"
                            >
                                {CTA_LABELS.retry}
                            </button>
                        </div>
                    ) : conversations.length ? (
                        <ul className="mt-3 space-y-1">
                            {conversations.map((conversation) => (
                                <li key={conversation.conversation_id}>
                                    {editingConversationId === conversation.conversation_id ? (
                                        <div className="space-y-2 rounded-(--radius-md) border border-(--border) p-2">
                                            <label
                                                className="sr-only"
                                                htmlFor={`title-${conversation.conversation_id}`}
                                            >
                                                Conversation title
                                            </label>
                                            <input
                                                ref={renameInputRef}
                                                id={`title-${conversation.conversation_id}`}
                                                value={editingTitle}
                                                onChange={(event) =>
                                                    setEditingTitle(event.target.value)
                                                }
                                                maxLength={120}
                                                className="w-full rounded-(--radius-sm) border border-(--border) bg-(--background) px-2 py-1.5 text-sm"
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void saveConversationTitle(
                                                            conversation.conversation_id,
                                                        )
                                                    }
                                                    className="text-xs font-medium text-(--accent)"
                                                >
                                                    {CTA_LABELS.save}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingConversationId(null)}
                                                    className="text-xs text-(--text-muted)"
                                                >
                                                    {CTA_LABELS.cancel}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-(--radius-md) px-3 py-2 hover:bg-(--surface-raised)">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void openConversation(
                                                        conversation.conversation_id,
                                                    )
                                                }
                                                className="w-full text-left text-sm text-(--text-secondary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                                            >
                                                <span className="line-clamp-2 font-medium">
                                                    {conversation.title || "Untitled investigation"}
                                                </span>
                                                <span className="mt-1 block text-xs text-(--text-muted)">
                                                    {conversation.message_count === 1
                                                        ? "1 message"
                                                        : `${conversation.message_count} messages`}
                                                </span>
                                            </button>
                                            <div className="mt-2 flex gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingConversationId(
                                                            conversation.conversation_id,
                                                        );
                                                        setEditingTitle(conversation.title ?? "");
                                                    }}
                                                    className="text-xs text-(--text-muted) hover:text-(--text-primary)"
                                                >
                                                    {CTA_LABELS.edit}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void removeConversation(
                                                            conversation.conversation_id,
                                                        )
                                                    }
                                                    className="text-xs text-(--text-muted) hover:text-(--negative)"
                                                >
                                                    {pendingDeleteId ===
                                                    conversation.conversation_id
                                                        ? CTA_LABELS.confirmDelete
                                                        : CTA_LABELS.delete}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-4 text-sm leading-6 text-(--text-muted)">
                            No retained conversations yet. Your first investigation will appear
                            here.
                        </p>
                    )}
                    {historyActionError ? (
                        <p role="alert" className="mt-3 text-xs text-(--negative)">
                            {historyActionError}
                        </p>
                    ) : null}
                </aside>
            ) : null}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="border-b border-(--border) bg-(--surface)/65 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                        <span className="text-(--text-muted)">
                            Proposed context:{" "}
                            <strong className="font-medium text-(--text-secondary)">
                                {proposedScopeLabel}
                            </strong>
                        </span>
                        <span className="text-(--text-muted)">
                            Committed scope:{" "}
                            <strong className="font-medium text-(--text-secondary)">
                                {committedScopeLabel ?? "Commits when you ask"}
                            </strong>
                        </span>
                        <span className="text-(--text-muted)">
                            Direct scope:{" "}
                            <strong className="font-medium text-(--text-secondary)">
                                {proposedScope.direct_scope.replaceAll("_", " ")}
                            </strong>
                        </span>
                        <span className="text-(--text-muted)">
                            Teams:{" "}
                            <strong className="font-medium text-(--text-secondary)">
                                {proposedScope.team_ids?.length
                                    ? `${proposedScope.team_ids.length} selected`
                                    : "All"}
                            </strong>
                        </span>
                        <span className="text-(--text-muted)">
                            Time:{" "}
                            <strong className="font-medium text-(--text-secondary)">
                                {formatDateUTC(proposedScope.time_range.start)} –{" "}
                                {formatDateUTC(proposedScope.time_range.end)}
                            </strong>
                        </span>
                        <label className="flex items-center gap-2 text-(--text-muted)">
                            Comparison
                            <select
                                value={filters.time.compare_days > 0 ? "previous" : "none"}
                                onChange={(event) =>
                                    setComparisonDays(
                                        event.target.value === "previous"
                                            ? filters.time.range_days
                                            : 0,
                                    )
                                }
                                className="rounded-(--radius-sm) border border-(--border) bg-(--surface) px-2 py-1 text-xs text-(--text-secondary)"
                            >
                                <option value="previous">Previous period</option>
                                <option value="none">No comparison</option>
                            </select>
                        </label>
                        {proposedContext ? (
                            <button
                                type="button"
                                onClick={clearProposedContext}
                                className="font-medium text-(--accent) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                            >
                                {CTA_LABELS.clearContext}
                            </button>
                        ) : null}
                    </div>
                </div>

                {/*
                 * No aria-live here: the transcript's running/failed states carry
                 * their own role="status"/role="alert" regions below, which
                 * announce at coarse phase transitions. Wrapping the whole
                 * scrollable transcript in aria-live would additionally announce
                 * every streamed answer.delta chunk as it arrives (CHAOS-3215 M3).
                 */}
                <div
                    className={`min-h-0 flex-1 overflow-y-auto px-4 ${compact ? "py-4" : "py-6 sm:px-6"}`}
                    aria-label="Ask Dev transcript"
                >
                    {transcript.length === 0 && stream.phase === "idle" ? (
                        <div className="mx-auto flex h-full max-w-xl flex-col justify-center py-8">
                            <p className="text-label-caps text-(--accent-ai)">
                                Evidence before certainty
                            </p>
                            <h2 className="mt-3 font-(--font-display) text-h2 text-(--text-primary)">
                                Ask what changed, what remains, or what the data supports.
                            </h2>
                            <p className="mt-3 text-sm leading-6 text-(--text-secondary)">
                                Ask Dev works from persisted metrics and evidence. It shows the
                                scope it used and calls out missing or stale sources.
                            </p>
                            <p className="mt-2 text-xs text-(--text-muted)">
                                Powered by Context Fabric.{" "}
                                {/*
                                 * Plain <a>, not next/link's <Link>: this
                                 * points at the separately-hosted customer
                                 * docs site (a different origin from the
                                 * app), and Link's client-side route
                                 * normalization can rewrite the target path
                                 * (e.g. trailing-slash handling) in ways that
                                 * do not apply to genuinely external URLs.
                                 */}
                                <a
                                    href={askDevDocsHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`${CTA_LABELS.viewAskDevDocs} — opens in new tab`}
                                    className="font-medium text-(--accent) underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                                >
                                    {CTA_LABELS.viewAskDevDocs}
                                    <span aria-hidden="true"> ↗</span>
                                </a>
                            </p>
                            {proposedQuestions.length ? (
                                <div
                                    className="mt-5 flex flex-wrap gap-2"
                                    aria-label="Suggested questions"
                                >
                                    {proposedQuestions.map((question) => (
                                        <button
                                            key={question.id}
                                            type="button"
                                            onClick={() => setDraft(question.label)}
                                            className="rounded-(--radius-pill) border border-(--border) px-3 py-1.5 text-left text-xs text-(--text-secondary) hover:border-(--accent-ai)/45 hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/45"
                                        >
                                            {question.label}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <ol className="mx-auto max-w-3xl space-y-6">
                            {transcript.map((entry) => (
                                <li
                                    key={entry.id}
                                    className={
                                        entry.role === "user" ? "ml-auto max-w-[85%]" : "max-w-full"
                                    }
                                >
                                    {entry.role === "user" ? (
                                        <div className="rounded-(--radius-lg) rounded-br-(--radius-sm) bg-(--accent)/13 px-4 py-3 text-sm leading-6 text-(--text-primary)">
                                            {entry.text}
                                        </div>
                                    ) : entry.answer.status === "error" ? (
                                        // A persisted answer with `status: "error"` must render
                                        // through the same failed/alert treatment as a live run
                                        // failure, not as ordinary completed output — otherwise
                                        // a genuine failure reads as a silent success (CHAOS-3215
                                        // M-error-status). Reuses the same id convention
                                        // (`ask-dev-answer-<id>`) that AskDevAnswer would have
                                        // used, so the completion focus-move effect above still
                                        // finds it.
                                        <div
                                            id={`ask-dev-answer-${entry.answer.answer_id}`}
                                            tabIndex={-1}
                                            className="rounded-(--radius-md) border border-(--negative)/30 bg-(--negative)/8 p-4 outline-none"
                                            role="alert"
                                        >
                                            <p className="text-sm font-medium text-(--negative)">
                                                The investigation stopped safely.
                                            </p>
                                            <p className="mt-1 text-sm text-(--text-secondary)">
                                                {entry.answer.direct_summary ||
                                                    "Ask Dev could not complete that request."}
                                            </p>
                                        </div>
                                    ) : (
                                        <AskDevAnswer answer={entry.answer} />
                                    )}
                                </li>
                            ))}

                            {stream.phase === "running" ? (
                                <li className="space-y-3 border-l-2 border-(--accent-ai)/45 pl-4">
                                    {/*
                                     * The interactive Cancel button below is deliberately kept
                                     * outside this role="status" region: an interactive element
                                     * inside a live region can be difficult for assistive
                                     * technology to operate, since the region may re-announce
                                     * around it. Only the announced progress text lives inside
                                     * (CHAOS-3215 L-cancel-live-region).
                                     */}
                                    <div role="status" className="space-y-3">
                                        <p className="text-sm font-medium text-(--text-primary)">
                                            {stream.progress
                                                ? (PROGRESS_LABELS[stream.progress] ??
                                                  "Investigating")
                                                : "Starting the investigation"}
                                        </p>
                                        {/*
                                         * Streamed delta text is visually rendered but excluded
                                         * from the announced role="status" region (aria-hidden) —
                                         * only the progress label above should be announced, at
                                         * phase transitions, not on every answer.delta chunk
                                         * (CHAOS-3215 M3).
                                         */}
                                        <div aria-hidden="true">
                                            {stream.delta ? (
                                                <p className="whitespace-pre-wrap text-sm leading-6 text-(--text-secondary)">
                                                    {stream.delta}
                                                </p>
                                            ) : (
                                                <div className="h-2 w-32 animate-pulse rounded-(--radius-pill) bg-(--accent-ai)/25 motion-reduce:animate-none" />
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={cancelRun}
                                        className="text-xs font-medium text-(--negative) underline-offset-4 hover:underline"
                                    >
                                        {CTA_LABELS.cancel}
                                    </button>
                                </li>
                            ) : null}

                            {stream.phase === "failed" ? (
                                <li
                                    id="ask-dev-run-failed"
                                    tabIndex={-1}
                                    className="rounded-(--radius-md) border border-(--negative)/30 bg-(--negative)/8 p-4 outline-none"
                                    role="alert"
                                >
                                    <p className="text-sm font-medium text-(--negative)">
                                        The investigation stopped safely.
                                    </p>
                                    <p className="mt-1 text-sm text-(--text-secondary)">
                                        {stream.error?.safe_message ??
                                            "Ask Dev could not complete that request."}
                                    </p>
                                    {errorGuidance ? (
                                        <p className="mt-2 text-xs leading-5 text-(--text-secondary)">
                                            {errorGuidance}
                                        </p>
                                    ) : null}
                                    {stream.error?.retryable && !allowanceGuidance ? (
                                        <button
                                            type="button"
                                            onClick={() => void retryLastQuestion()}
                                            className="mt-3 text-xs font-medium text-(--accent) underline-offset-4 hover:underline"
                                        >
                                            {CTA_LABELS.retry}
                                        </button>
                                    ) : null}
                                </li>
                            ) : null}

                            {stream.warnings.map((warning) => (
                                <li key={warning} className="text-sm text-(--caution)">
                                    {warning}
                                </li>
                            ))}
                        </ol>
                    )}
                    <div ref={transcriptEnd} />
                </div>

                <form
                    className="border-t border-(--border) bg-(--surface-raised) p-3 sm:p-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void submit();
                    }}
                >
                    <label htmlFor={composerId} className="sr-only">
                        Ask Dev question
                    </label>
                    <div className="flex items-end gap-2 rounded-(--radius-lg) border border-(--border) bg-(--background)/75 p-2 focus-within:border-(--accent)/60 focus-within:ring-2 focus-within:ring-(--accent)/15">
                        <textarea
                            ref={composerRef}
                            id={composerId}
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    void submit();
                                }
                            }}
                            rows={compact ? 2 : 3}
                            maxLength={4000}
                            placeholder="Ask about the evidence in this scope…"
                            className="max-h-40 min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-6 text-(--text-primary) outline-none placeholder:text-(--text-muted)"
                        />
                        <button
                            type="submit"
                            disabled={!draft.trim() || stream.phase === "running"}
                            aria-label={CTA_LABELS.askDev}
                            className="inline-flex h-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--accent) px-4 text-sm font-semibold text-(--accent-foreground) transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/50 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                            {CTA_LABELS.askDev}
                        </button>
                    </div>
                    {/*
                     * No per-conversation retention selector: retention is an
                     * org-admin-only 0/30-day policy (PATCH
                     * /api/v1/admin/ask-dev/settings). The backend always applied
                     * org policy and silently ignored any per-conversation
                     * `retention_days` sent from here, so the selector was a
                     * misleading affordance — removed per CHAOS-3215 M7 /
                     * CHAOS-3217.
                     */}
                    <div className="mt-2 text-xs text-(--text-muted)">
                        <span>Enter to ask · Shift+Enter for a new line</span>
                    </div>
                </form>
            </div>
        </div>
    );
}
