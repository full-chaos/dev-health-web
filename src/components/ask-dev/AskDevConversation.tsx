"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";

import type { DevProgressState } from "@/lib/dev/client";
import { CTA_LABELS } from "@/lib/design/cta";
import { safeCopy } from "@/lib/dev/internalTokens";
import { runtimeConfig } from "@/lib/runtimeConfig";
import { DataState } from "@/components/ui/DataState";

import { AskDevAnswer, attestedText, INTERNAL_TOKEN_DENYLIST } from "./AskDevAnswer";
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

/** Matches Tailwind's `lg` breakpoint — the width at which the History drawer defaults open (CHAOS-3524). */
const HISTORY_DRAWER_DESKTOP_QUERY = "(min-width: 1024px)";

function matchesHistoryDesktopDefault(): boolean {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(HISTORY_DRAWER_DESKTOP_QUERY).matches;
}

/**
 * CHAOS-3524: starter prompts for the empty state's "Quick Topics" chip row.
 * Chris's 2026-08-07 design pass left this vocabulary explicitly undecided
 * ("Quick Topics: variable / up to be determined (or can be deferred) — do
 * not hardcode a final set"). This list is a provisional placeholder to
 * satisfy the visual layout, not a decided taxonomy — swap, reorder, or
 * source it from configuration whenever that decision lands.
 */
const ASK_DEV_QUICK_TOPICS_PROVISIONAL: readonly {
    id: string;
    label: string;
    prompt: string;
}[] = [
    { id: "overview", label: "Overview", prompt: "Give me an overview of the current status." },
    { id: "pipelines", label: "Pipelines", prompt: "How are the pipelines performing?" },
    { id: "tests", label: "Tests", prompt: "What is the state of test health?" },
    { id: "coverage", label: "Coverage", prompt: "What does coverage look like right now?" },
];

type AskDevComposerProps = {
    composerId: string;
    composerRef: RefObject<HTMLTextAreaElement | null>;
    draft: string;
    setDraft: (value: string) => void;
    onSubmit: () => void;
    disabled: boolean;
};

/**
 * The question composer. CHAOS-3524's "the input stays FIXED at the bottom"
 * requirement is met literally: this is the ONE call site, rendered as the
 * last child of the conversation column in every state (empty or not) —
 * never conditionally mounted/unmounted based on isEmptyState. An earlier
 * version rendered a second, differently-positioned instance for the empty
 * state; that broke two things at once: the composer's DOM node (and any
 * text mid-typed into it) no longer survived the empty→conversation
 * transition since React sees two distinct call sites as two distinct
 * elements, and the CHAOS-3215 M5 modal focus-trap test — which relies on
 * the disabled submit button being excluded from the focusable set so the
 * textarea is genuinely the last focusable element — broke once other
 * (enabled) focusable content could land after the composer in DOM order.
 * Declared at module scope, not nested inside AskDevConversation, so its
 * component identity is stable across renders — an inline nested component
 * would remount (and drop focus/composition state) on every keystroke.
 */
function AskDevComposer({
    composerId,
    composerRef,
    draft,
    setDraft,
    onSubmit,
    disabled,
}: AskDevComposerProps) {
    return (
        <form
            className="border-t border-(--border) bg-(--surface-raised) p-3 sm:p-4"
            onSubmit={(event) => {
                event.preventDefault();
                onSubmit();
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
                            onSubmit();
                        }
                    }}
                    rows={3}
                    maxLength={4000}
                    placeholder="Ask about the evidence in this scope…"
                    className="max-h-40 min-h-12 flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-6 text-(--text-primary) outline-none placeholder:text-(--text-muted)"
                />
                <button
                    type="submit"
                    disabled={disabled}
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
    );
}

export function AskDevConversation({
    compact = false,
    showHistory = false,
}: {
    compact?: boolean;
    showHistory?: boolean;
}) {
    const {
        availability,
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
    // CHAOS-3524: chris's ruling is that History is a SLIDING DRAWER, not a
    // fixed rail — one state, one toggle button, at every breakpoint. It
    // slides in from the right over the conversation (an overlay, not a
    // second grid column — matches this codebase's other drawer,
    // BugReportButton.tsx's `fixed ... translate-x-0 transition-transform`).
    //
    // The lazy initializer guesses closed (SSR-safe: `window` doesn't exist
    // on the server, so it can't ask the real viewport width yet) and a
    // mount-time effect immediately corrects it to the actual default below
    // — the same two-step pattern AskDevWindow's useIsMobileFullScreen
    // already uses in this codebase, for the same hydration-safety reason.
    // Desktop (`lg:` and up, matching Tailwind's 1024px) defaults OPEN — the
    // shape tests/live/ask-dev-acceptance.spec.ts and
    // tests/ask-dev-continuity.spec.ts assume with no prior toggle click.
    // Below `lg`, and in jsdom component tests (no real `matchMedia`, so the
    // SSR-safe guess never gets corrected), it defaults CLOSED — the shape
    // AskDevProvider.test.tsx's CHAOS-3215 M4 test assumes.
    //
    // Guarded on `showHistory` (never calls matchMedia at all when it's
    // false, not just skips acting on the result): AskDevWindow renders
    // this component (compact, showHistory=false) inside its OWN
    // matchMedia consumer (useIsMobileFullScreen), and
    // AskDevProvider.test.tsx's matchMedia mock tracks one query object at
    // a time — an unconditional call here, even just to read `.matches`,
    // overwrites that shared tracking object and silently breaks
    // useIsMobileFullScreen's own test (CHAOS-3215 M5).
    const [historyPanelOpen, setHistoryPanelOpen] = useState(() =>
        showHistory ? matchesHistoryDesktopDefault() : false,
    );
    const composerId = useId();
    const historyPanelId = useId();
    const transcriptEnd = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    // CHAOS-3524: standard chat convention — once the reader scrolls away
    // from the bottom (e.g. into a large evidence block on an earlier
    // answer), a new streamed chunk or a newly-appended transcript entry
    // must not yank the viewport back down. Only a genuinely new
    // user-initiated question (submit(), below) forces the pin back on. No
    // prior "stick to bottom" pattern exists elsewhere in this codebase to
    // reuse (checked before adding this).
    const pinnedToBottom = useRef(true);
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    // Declared here (ahead of the effects below that reference it) rather than
    // inline where it was originally introduced, so the org-switch reset
    // effect can clear it too — see that effect's comment (CHAOS-3215).
    const runInProgress = useRef(false);
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
        // Guarded on `showHistory` — see historyPanelOpen's declaration
        // above for why this must never call matchMedia when the drawer
        // isn't even rendered.
        setHistoryPanelOpen(showHistory ? matchesHistoryDesktopDefault() : false);
    }

    // `runInProgress` is a ref, not visible state, so clearing it does not
    // need (and per the project's lint rules, must not use) the render-time
    // escape hatch above — a plain effect is fine here, unlike the setState
    // calls above it.
    useEffect(() => {
        runInProgress.current = false;
    }, [orgId]);

    // Corrects historyPanelOpen's SSR-safe closed guess to the real
    // viewport's default, and keeps it in sync with the `lg` breakpoint —
    // the same matchMedia subscribe-and-sync shape as AskDevWindow's
    // useIsMobileFullScreen (mirrored here rather than shared, it's a few
    // lines). `react-hooks/set-state-in-effect` requires setState to flow
    // from an external-system subscription, not a bare effect body — the
    // `addEventListener` below is that subscription; `update()` also
    // primes the initial value synchronously so the drawer doesn't sit on
    // its SSR-safe closed guess until the viewport actually changes.
    //
    // Gated on `showHistory`: AskDevWindow renders this component (compact,
    // showHistory=false) INSIDE its own matchMedia consumer
    // (useIsMobileFullScreen). AskDevProvider.test.tsx's single-query
    // matchMedia mock tracks one addEventListener registration at a time —
    // an unconditional subscription here re-registers over
    // useIsMobileFullScreen's listener the moment this component mounts,
    // silently breaking that component's own modal-focus-trap test. There
    // is nothing to default anyway when the drawer itself never renders.
    useEffect(() => {
        if (!showHistory) return;
        if (typeof window.matchMedia !== "function") return;
        const query = window.matchMedia(HISTORY_DRAWER_DESKTOP_QUERY);
        const update = () => setHistoryPanelOpen(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, [showHistory]);

    useEffect(() => {
        // CHAOS-3524: don't yank the viewport back to the bottom while the
        // reader has deliberately scrolled up — see pinnedToBottom's
        // declaration above and handleTranscriptScroll below.
        if (!pinnedToBottom.current) return;
        transcriptEnd.current?.scrollIntoView({ block: "nearest" });
    }, [stream.delta, stream.phase, transcript]);

    // Tracks whether the reader is at (or very near) the bottom of the
    // transcript. Re-pins on scrolling back down, so resuming to read live
    // output restores the normal auto-follow behavior without a page reload.
    const handleTranscriptScroll = () => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        pinnedToBottom.current = distanceFromBottom < 80;
    };

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
        // Sending a question is a deliberate user act — it always jumps the
        // conversation back to the bottom, even if the reader had scrolled
        // up to reread something (standard chat UX, and the one case that
        // must override the "don't yank" guard above).
        pinnedToBottom.current = true;
        await submitQuestion(question);
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

    // CHAOS-3524: drives the centered "What would you like to know?" empty
    // state vs. the scrolling-transcript + fixed-bottom-composer chat layout.
    const isEmptyState = transcript.length === 0 && stream.phase === "idle";
    const composerDisabled = !draft.trim() || stream.phase === "running";

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
            // CHAOS-3524: History is a sliding drawer that OVERLAYS the
            // conversation from the right (chris's ruling — not a second
            // grid column reserving permanent width), so this is a plain
            // `relative` flex column, not the `lg:grid` two-column layout
            // an earlier draft used. `overflow-hidden` clips the drawer
            // while it's translated off-screen so it can't force a
            // horizontal scrollbar.
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        >
            {showHistory ? (
                // One toggle, every breakpoint (mobile and desktop share
                // it) — see historyPanelOpen's declaration for why there
                // is deliberately no second, breakpoint-specific control.
                <button
                    type="button"
                    aria-expanded={historyPanelOpen}
                    aria-controls={historyPanelId}
                    onClick={() => setHistoryPanelOpen((open) => !open)}
                    className="absolute right-3 top-3 z-20 rounded-(--radius-sm) border border-(--border) bg-(--surface-raised) px-2.5 py-1.5 text-xs font-medium text-(--text-secondary) shadow-(--elevation-card) transition hover:border-(--accent)/45 hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                >
                    {historyPanelOpen ? CTA_LABELS.hideAskDevHistory : CTA_LABELS.showAskDevHistory}
                </button>
            ) : null}

            <div
                // CHAOS-3524: reserve room for the History drawer at desktop
                // widths while it's open, so its overlay never sits on top
                // of the composer's "Ask" button (found via live visual
                // verification — the drawer's `absolute` overlay could
                // intercept clicks meant for the button underneath it).
                // Below `lg`, and while the drawer is closed, no padding —
                // the conversation column uses the full width.
                className={`flex min-h-0 min-w-0 flex-1 flex-col transition-[padding] duration-200 ${
                    showHistory && historyPanelOpen ? "lg:pr-80" : ""
                }`}
            >
                {/*
                 * No aria-live here: the transcript's running/failed states carry
                 * their own role="status"/role="alert" regions below, which
                 * announce at coarse phase transitions. Wrapping the whole
                 * scrollable transcript in aria-live would additionally announce
                 * every streamed answer.delta chunk as it arrives (CHAOS-3215 M3).
                 */}
                <div
                    ref={scrollContainerRef}
                    onScroll={handleTranscriptScroll}
                    className={`min-h-0 flex-1 overflow-y-auto px-4 ${compact ? "py-4" : "py-6 sm:px-6"}`}
                    aria-label="Ask Dev transcript"
                >
                    {isEmptyState ? (
                        <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
                            <h2 className="font-(--font-display) text-h1 text-(--text-primary)">
                                What would you like to know?
                            </h2>

                            {proposedQuestions.length ? (
                                <div className="mt-6 w-full" aria-label="Suggested questions">
                                    <p className="text-label-caps text-(--text-muted)">
                                        Suggested for this page
                                    </p>
                                    <div className="mt-2 flex flex-wrap justify-center gap-2">
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
                                </div>
                            ) : null}

                            <div className="mt-6 w-full">
                                <p className="text-label-caps text-(--text-muted)">Quick Topics</p>
                                <div className="mt-2 flex flex-wrap justify-center gap-2">
                                    {ASK_DEV_QUICK_TOPICS_PROVISIONAL.map((topic) => (
                                        <button
                                            key={topic.id}
                                            type="button"
                                            onClick={() => setDraft(topic.prompt)}
                                            aria-pressed={draft === topic.prompt}
                                            className={`rounded-(--radius-pill) border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/45 ${
                                                draft === topic.prompt
                                                    ? "border-(--accent) bg-(--accent)/15 text-(--text-primary)"
                                                    : "border-(--border) text-(--text-secondary) hover:border-(--accent-ai)/45 hover:text-(--text-primary)"
                                            }`}
                                        >
                                            {topic.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <p className="mt-8 text-xs text-(--text-muted)">
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
                                                {/*
                                                 * This branch bypasses AskDevAnswer entirely, so
                                                 * it needs its own copy guard: an older persisted
                                                 * error answer whose summary narrates an internal
                                                 * token would otherwise leak it here while the
                                                 * ordinary answer path is protected (CHAOS-3367).
                                                 */}
                                                {safeCopy(
                                                    entry.answer.direct_summary,
                                                    INTERNAL_TOKEN_DENYLIST,
                                                    attestedText(entry.answer),
                                                ) || "Ask Dev could not complete that request."}
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

                {
                    // CHAOS-3524 (chris, follow-up ruling): the persistent
                    // "Proposed context / Committed scope / Direct scope /
                    // Teams / Time / Comparison" bar that used to sit above
                    // the transcript was dashboard chrome, not something an
                    // LLM chat surface should show — removed. What survives
                    // is display-only: a real surface-context proposal from
                    // a content page (proposedContext — e.g. "Ask Dev about
                    // this repository") still needs a visible accept/clear
                    // affordance, now a small chip directly above the
                    // composer instead of a persistent bar. It does NOT
                    // change what's sent — proposedScope/surface_context
                    // still flow into the request exactly as before; only
                    // this always-on display of it is gone. Per-answer
                    // committed-scope disclosure inside AskDevAnswer is
                    // untouched.
                }
                {proposedContext ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-(--border) bg-(--surface)/65 px-4 py-2 text-xs sm:px-6">
                        <span className="text-(--text-muted)">
                            Scoped to{" "}
                            <strong className="font-medium text-(--text-secondary)">
                                {proposedScopeLabel}
                            </strong>
                        </span>
                        <button
                            type="button"
                            onClick={clearProposedContext}
                            className="font-medium text-(--accent) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/45"
                        >
                            {CTA_LABELS.clearContext}
                        </button>
                    </div>
                ) : null}

                <AskDevComposer
                    composerId={composerId}
                    composerRef={composerRef}
                    draft={draft}
                    setDraft={setDraft}
                    onSubmit={() => void submit()}
                    disabled={composerDisabled}
                />
            </div>

            {showHistory ? (
                <aside
                    id={historyPanelId}
                    // Overlay drawer, slides in from the right over the
                    // conversation (CHAOS-3524) — `translate-x-full`
                    // parks it just off the right edge when closed;
                    // `pointer-events-none` there too, so a closed-but-
                    // still-in-the-DOM drawer can never intercept clicks
                    // meant for the conversation underneath it.
                    className={`absolute inset-y-0 right-0 z-10 w-72 overflow-y-auto border-l border-(--border) bg-(--surface-raised) p-4 pt-14 shadow-(--elevation-drawer) transition-transform duration-200 ease-out sm:w-80 ${
                        historyPanelOpen ? "translate-x-0" : "pointer-events-none translate-x-full"
                    }`}
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
        </div>
    );
}
