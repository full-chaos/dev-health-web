"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { CTA_LABELS } from "@/lib/design/cta";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";
import { formatDateUTC } from "@/lib/formatters";
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

const PROGRESS_LABELS: Record<string, string> = {
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
        proposedContext,
        proposedQuestions,
        proposedScope,
        proposedScopeLabel,
        renameConversation,
        retryLastQuestion,
        retentionDays,
        setRetentionDays,
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
    const composerId = useId();
    const transcriptEnd = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const filters = useMemo(() => decodeFilter(searchParams.get("f")), [searchParams]);
    const allowanceGuidance = platformAllowanceGuidance(stream.error);

    useEffect(() => {
        if (showHistory && availability.state === "ready") void loadHistory();
    }, [availability.state, loadHistory, showHistory]);

    useEffect(() => {
        transcriptEnd.current?.scrollIntoView({ block: "nearest" });
    }, [stream.delta, stream.phase, transcript]);

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
            className={`flex min-h-0 flex-1 ${showHistory ? "lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]" : ""}`}
        >
            {showHistory ? (
                <aside
                    className="hidden border-r border-(--border) bg-(--surface)/65 p-4 lg:block"
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

                <div
                    className={`min-h-0 flex-1 overflow-y-auto px-4 ${compact ? "py-4" : "py-6 sm:px-6"}`}
                    aria-live="polite"
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
                                    ) : (
                                        <AskDevAnswer answer={entry.answer} />
                                    )}
                                </li>
                            ))}

                            {stream.phase === "running" ? (
                                <li
                                    className="space-y-3 border-l-2 border-(--accent-ai)/45 pl-4"
                                    role="status"
                                >
                                    <p className="text-sm font-medium text-(--text-primary)">
                                        {stream.progress
                                            ? (PROGRESS_LABELS[stream.progress] ?? "Investigating")
                                            : "Starting the investigation"}
                                    </p>
                                    {stream.delta ? (
                                        <p className="whitespace-pre-wrap text-sm leading-6 text-(--text-secondary)">
                                            {stream.delta}
                                        </p>
                                    ) : (
                                        <div
                                            className="h-2 w-32 animate-pulse rounded-(--radius-pill) bg-(--accent-ai)/25"
                                            aria-hidden="true"
                                        />
                                    )}
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
                                    className="rounded-(--radius-md) border border-(--negative)/30 bg-(--negative)/8 p-4"
                                    role="alert"
                                >
                                    <p className="text-sm font-medium text-(--negative)">
                                        The investigation stopped safely.
                                    </p>
                                    <p className="mt-1 text-sm text-(--text-secondary)">
                                        {stream.error?.safe_message ??
                                            "Ask Dev could not complete that request."}
                                    </p>
                                    {allowanceGuidance ? (
                                        <p className="mt-2 text-xs leading-5 text-(--text-secondary)">
                                            {allowanceGuidance}
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
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-(--text-muted)">
                        <span>Enter to ask · Shift+Enter for a new line</span>
                        <label className="flex items-center gap-2">
                            History
                            <select
                                value={retentionDays}
                                onChange={(event) =>
                                    setRetentionDays(event.target.value === "0" ? 0 : 30)
                                }
                                disabled={transcript.length > 0}
                                className="rounded-(--radius-sm) border border-(--border) bg-(--surface) px-2 py-1 text-xs text-(--text-secondary)"
                                aria-label="Conversation retention"
                            >
                                <option value="30">30 days</option>
                                <option value="0">Do not retain</option>
                            </select>
                        </label>
                    </div>
                </form>
            </div>
        </div>
    );
}
