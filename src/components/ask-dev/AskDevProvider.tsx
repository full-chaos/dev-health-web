"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";

import type { DevApiClient, DevConversationList, DevWebError } from "@/lib/dev/client";
import {
    devApiClient,
    initialDevConversationStreamState,
    reduceDevConversationStream,
} from "@/lib/dev/client";
import {
    askDevContextForPathname,
    askDevDirectScope,
    askDevSuggestedQuestions,
    askDevSurfaceContextLabel,
    fingerprintAskDevFilter,
    isApprovedAskDevSurfaceContext,
    toDevSurfaceContext,
    type AskDevSurfaceContext,
} from "@/lib/dev/contextualEntryPoints";
import type {
    DevAnswer,
    DevCapabilities,
    DevConversation,
    DevConversationTranscript,
    DevEvidenceExpansion,
    DevMessageRequest,
    DevScope,
    DevStreamEvent,
} from "@/lib/dev/generated";
import { decodeFilter, encodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";
import { navTitleForPathname } from "@/lib/navigation/areas";

import { AskDevWindow } from "./AskDevWindow";

export type AskDevTranscriptEntry =
    | {
          id: string;
          role: "user";
          text: string;
          retryOfRunId: string | null;
          runId: string | null;
          runState: TranscriptEntry["run_state"] | null;
          scope: DevScope;
      }
    | {
          id: string;
          role: "assistant";
          answer: DevAnswer;
          retryOfRunId: string | null;
          runId: string | null;
          runState: TranscriptEntry["run_state"];
      };

type TranscriptEntry = NonNullable<DevConversationTranscript["items"]>[number];

export type AskDevPanelMode = "closed" | "compact" | "expanded";
export type AskDevAvailability =
    | { state: "loading" }
    | { state: "ready"; capabilities: DevCapabilities }
    | { state: "disabled"; capabilities: DevCapabilities }
    | { state: "not_ready"; capabilities: DevCapabilities; safeReason: string }
    | { state: "error"; safeReason: string };
type AskDevEntityRef = NonNullable<DevScope["entity_refs"]>[number];

type AskDevContextValue = {
    availability: AskDevAvailability;
    committedScopeLabel: string | null;
    conversationId: string | null;
    conversations: DevConversationList["items"];
    historyError: string | null;
    historyLoading: boolean;
    orgId: string;
    panelMode: AskDevPanelMode;
    persistentReturnHref: string;
    proposedContext: AskDevSurfaceContext | null;
    proposedScope: DevScope;
    proposedScopeLabel: string;
    proposedQuestions: readonly { id: string; label: string }[];
    stream: typeof initialDevConversationStreamState;
    transcript: AskDevTranscriptEntry[];
    cancelRun: () => void;
    closePanel: () => void;
    deleteConversation: (conversationId: string) => Promise<void>;
    expandEvidence: (evidenceRefId: string, answerId: string) => Promise<DevEvidenceExpansion>;
    loadHistory: () => Promise<void>;
    openConversation: (conversationId: string) => Promise<void>;
    openPanel: () => void;
    contextualEntrypointsEnabled: boolean;
    clearProposedContext: () => void;
    setProposedContext: (context: AskDevSurfaceContext) => void;
    selectProposedEntity: (entity: AskDevEntityRef) => void;
    renameConversation: (conversationId: string, title: string) => Promise<void>;
    retryLastQuestion: () => Promise<void>;
    returnToPersistentWindow: () => void;
    setPanelMode: (mode: AskDevPanelMode) => void;
    startNewConversation: () => void;
    submitAnswerFeedback: (answerId: string, rating: "helpful" | "not_helpful") => Promise<void>;
    submitQuestion: (question: string) => Promise<void>;
};

const AskDevContext = createContext<AskDevContextValue | null>(null);

function availabilityFromCapabilities(capabilities: DevCapabilities): AskDevAvailability {
    if (capabilities.ask_dev !== true) return { state: "disabled", capabilities };
    if (capabilities.can_read !== true || capabilities.readiness !== "ready") {
        return {
            state: "not_ready",
            capabilities,
            safeReason:
                capabilities.administrator_safe_failure_reason ??
                "Ask Dev is enabled, but an administrator needs to complete provider readiness.",
        };
    }
    return { state: "ready", capabilities };
}

function createScope(
    orgId: string,
    pathname: string,
    filters: MetricFilter,
    implicitContext: AskDevSurfaceContext | null,
): DevScope {
    const end = filters.time.end_date ? new Date(filters.time.end_date) : new Date();
    const start = filters.time.start_date ? new Date(filters.time.start_date) : new Date(end);
    if (!filters.time.start_date) start.setUTCDate(start.getUTCDate() - filters.time.range_days);
    const comparisonEnd = new Date(start);
    const comparisonStart = new Date(comparisonEnd);
    comparisonStart.setUTCDate(comparisonStart.getUTCDate() - filters.time.compare_days);
    const filtersApplyToScope = pathname === "/dev" || implicitContext !== null;
    const repositoryIds = (
        filtersApplyToScope
            ? filters.scope.level === "repo"
                ? filters.scope.ids
                : (filters.what.repos ?? [])
            : []
    ).slice(0, 20) as NonNullable<DevScope["repositories"]>;
    const teamIds = (
        filtersApplyToScope && filters.scope.level === "team" ? filters.scope.ids : []
    ).slice(0, 20) as NonNullable<DevScope["team_ids"]>;
    const directScope = repositoryIds.length ? "repository" : "organization";

    return {
        schema_version: "dev_scope.v1",
        organization_id: orgId,
        direct_scope: directScope,
        entity_refs: [],
        repositories: repositoryIds,
        team_ids: teamIds,
        time_range: {
            start: start.toISOString(),
            end: end.toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
        comparison_range:
            filters.time.compare_days > 0
                ? {
                      start: comparisonStart.toISOString(),
                      end: comparisonEnd.toISOString(),
                      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                  }
                : null,
        surface_context: implicitContext ? toDevSurfaceContext(implicitContext) : null,
    };
}

function safeMessage(error: unknown): string {
    if (error && typeof error === "object" && "detail" in error) {
        const detail = (error as { detail?: { safe_message?: unknown } }).detail;
        if (typeof detail?.safe_message === "string") return detail.safe_message;
    }
    if (error && typeof error === "object" && "safeMessage" in error) {
        const message = (error as { safeMessage?: unknown }).safeMessage;
        if (typeof message === "string") return message;
    }
    if (error instanceof Error && error.message) return error.message;
    return "Ask Dev could not complete that request. Please try again.";
}

function webError(error: unknown): DevWebError {
    if (error && typeof error === "object" && "detail" in error) {
        const detail = (error as { detail?: DevWebError }).detail;
        if (detail?.schema_version === "dev_web_error.v1") return detail;
    }
    return {
        schema_version: "dev_web_error.v1",
        code: "request_failed",
        safe_message: safeMessage(error),
        retryable: true,
    };
}

function conversationLabel(conversation: DevConversation): string {
    return (
        conversation.current_scope.surface_context?.route_id
            ?.split("_")
            .filter(Boolean)
            .map((part) => part[0]?.toUpperCase() + part.slice(1))
            .join(" ") || "Organization"
    );
}

function toTranscriptEntry(entry: TranscriptEntry): AskDevTranscriptEntry {
    if (entry.role === "user" && entry.question && entry.scope) {
        return {
            id: entry.message_id,
            role: "user",
            text: entry.question,
            retryOfRunId: entry.retry_of_run_id ?? null,
            runId: entry.run_id,
            runState: entry.run_state,
            scope: entry.scope,
        };
    }
    if (entry.role === "assistant" && entry.answer) {
        return {
            id: entry.message_id,
            role: "assistant",
            answer: entry.answer,
            retryOfRunId: entry.retry_of_run_id ?? null,
            runId: entry.run_id,
            runState: entry.run_state,
        };
    }
    throw new Error("Ask Dev returned an invalid conversation transcript.");
}

const MAX_TRANSCRIPT_PAGES = 10;
const TRANSCRIPT_PAGE_SIZE = 100;

function answerRunState(answer: DevAnswer): TranscriptEntry["run_state"] {
    if (answer.status === "insufficient_evidence" || answer.status === "refused") {
        return answer.status;
    }
    return answer.status === "error" ? "failed" : "completed";
}

export function AskDevProvider({
    children,
    client = devApiClient,
    contextualEntrypointsEnabled = false,
    orgId,
}: {
    children: ReactNode;
    client?: DevApiClient;
    contextualEntrypointsEnabled?: boolean;
    orgId: string;
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const searchString = searchParams.toString();
    const [panelMode, setPanelMode] = useState<AskDevPanelMode>("closed");
    const [persistentReturnHref, setPersistentReturnHref] = useState("/dashboard");
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<AskDevTranscriptEntry[]>([]);
    const [conversations, setConversations] = useState<DevConversationList["items"]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [committedScopeLabel, setCommittedScopeLabel] = useState<string | null>(null);
    const [stream, setStream] = useState(initialDevConversationStreamState);
    const [availability, setAvailability] = useState<AskDevAvailability>({ state: "loading" });
    // Once the floating window has been shown at all, an org-switch-triggered
    // capabilities refetch (which synchronously resets `availability` back to
    // "loading" below) must not unmount it — only its *content* should fail
    // closed to a loading state while the new organization's capabilities are
    // pending (AskDevConversation already renders that). Otherwise the whole
    // window would flicker closed and reopen on every org switch, which the
    // H1 fix's "the window itself stays open" invariant explicitly rules out.
    // It intentionally does NOT reset during the render-time org-switch block
    // below — resetting it there, alongside `availability`, would collapse
    // straight back into the H1 flicker it exists to prevent, since the
    // launcher would vanish for the entire "loading" window of every org
    // switch. It DOES reset once the new organization's capabilities resolve
    // to `disabled` (an actual `ask_dev` capability check, not merely "not
    // ready or loading") — otherwise an org that genuinely never had Ask Dev
    // available would keep showing the launcher forever because some
    // *other*, earlier organization in the session once did (CHAOS-3215).
    const [everAvailable, setEverAvailable] = useState(false);
    const activeRequest = useRef<AbortController | null>(null);
    const activeHistoryRequest = useRef<AbortController | null>(null);
    const historySelection = useRef(0);
    // Mirrors the latest `orgId` prop for use inside async callbacks (after an
    // `await`), so a response that resolves after the organization changed
    // again can recognize itself as stale even before the cleanup effect below
    // has run. A plain overwrite during render (not an increment) is safe
    // under React 18 Strict Mode's dev-only double-render: assigning the same
    // value twice is a no-op (CHAOS-3215 H2).
    const orgIdRef = useRef(orgId);
    orgIdRef.current = orgId;
    const encodedFilter = searchParams.get("f");
    const filters = useMemo(
        () =>
            encodedFilter
                ? decodeFilter(encodedFilter)
                : filterFromQueryParams(Object.fromEntries(new URLSearchParams(searchString))),
        [encodedFilter, searchString],
    );
    // Approved ambient routes (data_health, diagnose_overview, flow_metrics,
    // investment, cognitive_load, bottlenecks) get an implicit scope context
    // with no user action required -- it already silently drives `routeScope`
    // below (the "Proposed context:" banner). Suggested questions must follow
    // the same implicit context, not just an explicit `setProposedContext`
    // call from a per-entity "Ask Dev about this" trigger: many ambient
    // routes (e.g. /data-health) have no such trigger at all, so the only way
    // in is the permanent floating launcher, and it must not open to a
    // contextually-blank composer with zero suggested questions (CHAOS-3410).
    const ambientContext = useMemo(
        () => askDevContextForPathname(pathname, fingerprintAskDevFilter(encodeFilter(filters))),
        [pathname, filters],
    );
    const routeScope = useMemo(
        () => createScope(orgId, pathname, filters, ambientContext),
        [ambientContext, filters, orgId, pathname],
    );
    const [surfaceProposal, setSurfaceProposal] = useState<{
        context: AskDevSurfaceContext;
        scope: DevScope;
        label: string;
        sourcePathname: string;
    } | null>(null);
    const activeSurfaceProposal =
        surfaceProposal && (surfaceProposal.sourcePathname === pathname || pathname === "/dev")
            ? surfaceProposal
            : null;
    const proposedContext = activeSurfaceProposal?.context ?? null;
    const proposedScope = activeSurfaceProposal?.scope ?? routeScope;
    const proposedScopeLabel =
        activeSurfaceProposal?.label ??
        (routeScope.surface_context || pathname === "/dev"
            ? (navTitleForPathname(pathname) ?? "Current page")
            : "Organization");
    const proposedQuestions = useMemo(() => {
        const context = proposedContext ?? ambientContext;
        return context ? askDevSuggestedQuestions(context) : [];
    }, [ambientContext, proposedContext]);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        void client
            .getCapabilities({ signal: controller.signal })
            .then((capabilities) => {
                if (active) setAvailability(availabilityFromCapabilities(capabilities));
            })
            .catch((error) => {
                if (active && !controller.signal.aborted) {
                    setAvailability({ state: "error", safeReason: safeMessage(error) });
                }
            });
        return () => {
            active = false;
            controller.abort();
        };
    }, [client, orgId]);

    useEffect(() => {
        if (availability.state === "ready" || availability.state === "not_ready") {
            setEverAvailable(true);
        } else if (availability.state === "disabled") {
            setEverAvailable(false);
        }
    }, [availability.state]);

    useEffect(() => {
        if (pathname !== "/dev" && !pathname.startsWith("/superadmin/context-fabric/validation")) {
            setPersistentReturnHref(`${pathname}${searchString ? `?${searchString}` : ""}`);
        }
    }, [pathname, searchString]);

    // A contextual scope proposal is only trustworthy while the user is still on
    // (or has gone straight to /dev from) the page that registered it. Once the
    // user visits any other route, permanently clear it — not just hide it —
    // so it can never resurface later on an unrelated visit to /dev (CHAOS-3215 M1).
    useEffect(() => {
        setSurfaceProposal((current) =>
            current && pathname !== current.sourcePathname && pathname !== "/dev" ? null : current,
        );
    }, [pathname]);

    // Conversation state is keyed to the active organization. AskDevProvider is
    // mounted once in the app shell layout and receives `orgId` as a prop from
    // the server session — switching orgs triggers a router.refresh() that
    // updates this prop on the already-mounted provider without unmounting it.
    //
    // This reset runs synchronously during render — the "adjusting state while
    // rendering" pattern (https://react.dev/learn/you-might-not-need-an-effect)
    // — rather than in a `useEffect`. A passive effect only fires after React
    // has already committed (and the browser can paint) a render that still
    // shows the previous organization's transcript/conversation/history, so
    // for a tenant boundary a post-commit effect is one paint frame too late
    // (CHAOS-3215 H1). Comparing against a `useState`-tracked previous value
    // (not a ref) is the documented-safe form of this pattern: React discards
    // a duplicate `setState` call from Strict Mode's dev-only double render,
    // so this cannot double-apply.
    const [previousOrgId, setPreviousOrgId] = useState(orgId);
    if (orgId !== previousOrgId) {
        setPreviousOrgId(orgId);
        // A plain ref bump, not a `setState` call, so it invalidates any
        // in-flight `openConversation` selection immediately — before the
        // cleanup effect below (or any promise callback) can run. Harmless if
        // Strict Mode's dev-only double render bumps it twice: it is only ever
        // compared for (in)equality, never read as an absolute count.
        historySelection.current += 1;
        setConversationId(null);
        setCommittedScopeLabel(null);
        setTranscript([]);
        setStream(initialDevConversationStreamState);
        setConversations([]);
        setHistoryError(null);
        setSurfaceProposal(null);
        // Fail closed rather than keep showing the previous organization's
        // availability/remediation copy until the new organization's
        // capabilities have been (re)fetched by the effect above.
        setAvailability({ state: "loading" });
    }

    // Aborting an in-flight request is a real side effect (an
    // AbortController's listeners can run synchronously), so it stays in an
    // effect rather than the render-time block above. This effect has no
    // setup body — only its cleanup — so the same abort runs both when
    // `orgId` changes and when the provider itself unmounts (e.g. an
    // entitlement change removes Ask Dev from the tree, where a `[orgId]`
    // reset effect would otherwise never fire). Also covers the M2 gap:
    // provider unmount previously left `activeRequest` unaborted.
    useEffect(() => {
        return () => {
            activeRequest.current?.abort();
            activeRequest.current = null;
            activeHistoryRequest.current?.abort();
            activeHistoryRequest.current = null;
        };
    }, [orgId]);

    const clearProposedContext = useCallback(() => setSurfaceProposal(null), []);
    const setProposedContext = useCallback(
        (context: AskDevSurfaceContext) => {
            if (!contextualEntrypointsEnabled || !isApprovedAskDevSurfaceContext(context)) return;
            const surfaceContext = toDevSurfaceContext(context);
            const directScope = askDevDirectScope(context);
            setSurfaceProposal({
                context,
                scope: {
                    ...routeScope,
                    ...directScope,
                    surface_context: surfaceContext,
                },
                label: askDevSurfaceContextLabel(context),
                sourcePathname: pathname,
            });
        },
        [contextualEntrypointsEnabled, pathname, routeScope],
    );

    const selectProposedEntity = useCallback(
        (entity: AskDevEntityRef) => {
            const routeId =
                entity.entity_type === "repository"
                    ? "repository_detail"
                    : entity.entity_type === "project"
                      ? "project_detail"
                      : entity.entity_type === "work_unit"
                        ? "work_unit_detail"
                        : entity.entity_type === "issue"
                          ? "issue_detail"
                          : entity.entity_type === "pull_request"
                            ? "pull_request_detail"
                            : null;
            if (!routeId) return;
            setProposedContext({ routeId, entityRefs: [entity] });
        },
        [setProposedContext],
    );

    const loadHistory = useCallback(async () => {
        activeHistoryRequest.current?.abort();
        const controller = new AbortController();
        activeHistoryRequest.current = controller;
        const requestOrgId = orgIdRef.current;
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const result = await client.listConversations({ signal: controller.signal });
            // A stale response — from a superseded `loadHistory` call or from
            // an organization switch that happened while this request was in
            // flight — must never repopulate the history UI with another
            // tenant's conversation titles (CHAOS-3215 H2).
            if (activeHistoryRequest.current !== controller || orgIdRef.current !== requestOrgId) {
                return;
            }
            setConversations(result.items);
        } catch (error) {
            if (controller.signal.aborted) return;
            if (activeHistoryRequest.current !== controller || orgIdRef.current !== requestOrgId) {
                return;
            }
            setHistoryError(safeMessage(error));
        } finally {
            if (activeHistoryRequest.current === controller) {
                activeHistoryRequest.current = null;
                setHistoryLoading(false);
            }
        }
    }, [client]);

    const openConversation = useCallback(
        async (nextConversationId: string) => {
            const selection = ++historySelection.current;
            activeRequest.current?.abort();
            activeRequest.current = null;
            setHistoryError(null);
            try {
                const conversation = await client.getConversation(nextConversationId);
                if (selection !== historySelection.current) return;
                const retainedEntries: AskDevTranscriptEntry[] = [];
                let cursor: string | undefined;
                let pageCount = 0;
                do {
                    const page = await client.getConversationTranscript(nextConversationId, {
                        cursor,
                        limit: TRANSCRIPT_PAGE_SIZE,
                    });
                    if (selection !== historySelection.current) return;
                    retainedEntries.push(...(page.items ?? []).map(toTranscriptEntry));
                    cursor = page.next_cursor ?? undefined;
                    pageCount += 1;
                } while (cursor && pageCount < MAX_TRANSCRIPT_PAGES);
                if (cursor) {
                    throw new Error("This conversation is too long to open safely.");
                }
                setConversationId(conversation.conversation_id);
                setCommittedScopeLabel(conversationLabel(conversation));
                setTranscript(retainedEntries);
                setStream(initialDevConversationStreamState);
            } catch (error) {
                if (selection === historySelection.current) setHistoryError(safeMessage(error));
            }
        },
        [client],
    );

    const startNewConversation = useCallback(() => {
        historySelection.current += 1;
        activeRequest.current?.abort();
        activeRequest.current = null;
        setConversationId(null);
        setCommittedScopeLabel(null);
        setTranscript([]);
        setStream(initialDevConversationStreamState);
    }, []);

    const cancelRun = useCallback(() => {
        const controller = activeRequest.current;
        if (!controller) return;
        controller.abort();
        activeRequest.current = null;
        setStream((current) => ({
            ...current,
            phase: "failed",
            error: {
                schema_version: "dev_web_error.v1",
                code: "cancelled",
                safe_message: "The investigation was cancelled.",
                retryable: true,
            },
        }));
    }, []);

    const renameConversation = useCallback(
        async (targetConversationId: string, title: string) => {
            const renamed = await client.renameConversation(targetConversationId, {
                title: title.trim() || null,
            });
            setConversations((current) =>
                current.map((conversation) =>
                    conversation.conversation_id === targetConversationId
                        ? { ...conversation, title: renamed.title, updated_at: renamed.updated_at }
                        : conversation,
                ),
            );
        },
        [client],
    );

    const deleteConversation = useCallback(
        async (targetConversationId: string) => {
            const requestOrgId = orgIdRef.current;
            await client.deleteConversation(targetConversationId);
            // A delayed deletion completion from a since-switched-away
            // organization must not clear or abort whatever the *current*
            // organization is doing (CHAOS-3215 M-delete).
            if (orgIdRef.current !== requestOrgId) return;
            setConversations((current) =>
                current.filter(
                    (conversation) => conversation.conversation_id !== targetConversationId,
                ),
            );
            if (conversationId === targetConversationId) startNewConversation();
        },
        [client, conversationId, startNewConversation],
    );

    const expandEvidence = useCallback(
        (evidenceRefId: string, answerId: string) => client.expandEvidence(evidenceRefId, answerId),
        [client],
    );

    const submitAnswerFeedback = useCallback(
        async (answerId: string, rating: "helpful" | "not_helpful") => {
            await client.submitFeedback(answerId, {
                rating,
                reasons: rating === "helpful" ? ["useful"] : ["unclear"],
            });
        },
        [client],
    );

    const executeQuestion = useCallback(
        async (
            question: string,
            retry?: Readonly<{ runId: string; scope: DevScope; scopeLabel: string }>,
        ) => {
            const normalizedQuestion = question.trim();
            if (!normalizedQuestion || stream.phase === "running" || availability.state !== "ready")
                return;

            const requestScope = retry?.scope ?? proposedScope;
            const requestScopeLabel = retry?.scopeLabel ?? proposedScopeLabel;
            const userEntryId = crypto.randomUUID();
            setTranscript((current) => [
                ...current,
                {
                    id: userEntryId,
                    role: "user",
                    text: normalizedQuestion,
                    retryOfRunId: retry?.runId ?? null,
                    runId: null,
                    runState: null,
                    scope: requestScope,
                },
            ]);
            setCommittedScopeLabel(requestScopeLabel);
            setStream({ ...initialDevConversationStreamState, phase: "running" });

            const controller = new AbortController();
            let activeRunId: string | null = null;
            activeRequest.current?.abort();
            activeRequest.current = controller;
            // Captured once, before any `await`: the org-switch render-time
            // reset already clears visible state synchronously (CHAOS-3215
            // H1), but this closure can still be resumed by a microtask after
            // the org changed again and before the cleanup effect aborts
            // `controller`. Checking identity against `orgIdRef.current` at
            // every resumption point closes that residual window.
            const requestOrgId = orgIdRef.current;
            const superseded = () =>
                controller.signal.aborted ||
                activeRequest.current !== controller ||
                orgIdRef.current !== requestOrgId;

            try {
                let activeConversationId = conversationId;
                if (!activeConversationId) {
                    // Conversation-creation is not itself streamed, but it must still
                    // honor cancellation: if a reset (startNewConversation) or a history
                    // selection (openConversation) supersedes this request while it is
                    // in flight, activeRequest.current will no longer be `controller` by
                    // the time this resolves. Bail out before applying its result so a
                    // late response can never overwrite state set by whatever superseded
                    // it (CHAOS-3215 H2).
                    const created = await client.createConversation(
                        {
                            current_scope: requestScope,
                            title: normalizedQuestion.slice(0, 80),
                        },
                        { signal: controller.signal },
                    );
                    if (superseded()) return;
                    activeConversationId = created.conversation_id;
                    setConversationId(activeConversationId);
                    void loadHistory();
                }

                const request: DevMessageRequest = {
                    schema_version: "dev_message_request.v1",
                    client_message_id: userEntryId,
                    request_id: crypto.randomUUID(),
                    conversation_id: activeConversationId,
                    question: normalizedQuestion,
                    question_class: "investigation",
                    scope: requestScope,
                    ...(retry ? { retry_of_run_id: retry.runId } : {}),
                };

                const answer = await client.streamMessage(activeConversationId, request, {
                    signal: controller.signal,
                    onEvent: (event: DevStreamEvent) => {
                        if (superseded()) return;
                        if (event.event === "run.started") {
                            activeRunId = event.run_id;
                            setTranscript((current) =>
                                current.map((entry) =>
                                    entry.id === userEntryId && entry.role === "user"
                                        ? {
                                              ...entry,
                                              runId: event.run_id,
                                              runState: "accepted",
                                          }
                                        : entry,
                                ),
                            );
                        }
                        setStream((current) => reduceDevConversationStream(current, event));
                    },
                });
                if (superseded()) return;
                setTranscript((current) => [
                    ...current,
                    {
                        id: answer.answer_id,
                        role: "assistant",
                        answer,
                        retryOfRunId: retry?.runId ?? null,
                        runId: activeRunId,
                        runState: answerRunState(answer),
                    },
                ]);
            } catch (error) {
                if (!controller.signal.aborted && orgIdRef.current === requestOrgId) {
                    setStream((current) => ({
                        ...current,
                        phase: "failed",
                        error: webError(error),
                    }));
                }
            } finally {
                if (activeRequest.current === controller) activeRequest.current = null;
            }
        },
        [
            client,
            availability.state,
            conversationId,
            loadHistory,
            proposedScope,
            proposedScopeLabel,
            stream.phase,
        ],
    );

    const submitQuestion = useCallback(
        (question: string) => executeQuestion(question),
        [executeQuestion],
    );

    const retryLastQuestion = useCallback(async () => {
        const lastQuestion = [...transcript]
            .reverse()
            .find(
                (entry): entry is Extract<AskDevTranscriptEntry, { role: "user" }> =>
                    entry.role === "user",
            );
        if (lastQuestion?.runId) {
            await executeQuestion(lastQuestion.text, {
                runId: lastQuestion.runId,
                scope: lastQuestion.scope,
                scopeLabel: committedScopeLabel ?? proposedScopeLabel,
            });
            return;
        }
        if (lastQuestion) await executeQuestion(lastQuestion.text);
    }, [committedScopeLabel, executeQuestion, proposedScopeLabel, transcript]);

    const value = useMemo<AskDevContextValue>(
        () => ({
            availability,
            committedScopeLabel,
            conversationId,
            conversations,
            historyError,
            historyLoading,
            orgId,
            panelMode,
            persistentReturnHref,
            proposedContext,
            proposedScope,
            proposedScopeLabel,
            proposedQuestions,
            stream,
            transcript,
            cancelRun,
            contextualEntrypointsEnabled,
            clearProposedContext,
            closePanel: () => setPanelMode("closed"),
            deleteConversation,
            expandEvidence,
            loadHistory,
            openConversation,
            openPanel: () => setPanelMode("compact"),
            setProposedContext,
            selectProposedEntity,
            renameConversation,
            retryLastQuestion,
            returnToPersistentWindow: () => setPanelMode("compact"),
            setPanelMode,
            startNewConversation,
            submitAnswerFeedback,
            submitQuestion,
        }),
        [
            availability,
            committedScopeLabel,
            conversationId,
            conversations,
            clearProposedContext,
            contextualEntrypointsEnabled,
            historyError,
            historyLoading,
            cancelRun,
            deleteConversation,
            expandEvidence,
            loadHistory,
            openConversation,
            orgId,
            panelMode,
            persistentReturnHref,
            proposedContext,
            proposedScope,
            proposedScopeLabel,
            proposedQuestions,
            renameConversation,
            retryLastQuestion,
            startNewConversation,
            stream,
            submitAnswerFeedback,
            submitQuestion,
            setProposedContext,
            selectProposedEntity,
            transcript,
        ],
    );

    const showPersistentWindow =
        (availability.state === "ready" || availability.state === "not_ready" || everAvailable) &&
        pathname !== "/dev" &&
        !pathname.startsWith("/superadmin/context-fabric/validation");

    return (
        <AskDevContext.Provider value={value}>
            {children}
            {showPersistentWindow ? <AskDevWindow /> : null}
        </AskDevContext.Provider>
    );
}

export function useAskDev(): AskDevContextValue {
    const value = useContext(AskDevContext);
    if (!value) throw new Error("useAskDev must be used inside AskDevProvider");
    return value;
}

export function useOptionalAskDev(): AskDevContextValue | null {
    return useContext(AskDevContext);
}
