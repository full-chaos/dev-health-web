// Deterministic Ask Dev mock backend for the default Playwright suite
// (CHAOS-3287). Every payload here is derived from the checked-in,
// schema-validated canonical examples under
// src/lib/dev/contracts/examples/positive/ — never hand-invented shapes —
// so a drift between this mock and the real dev_answer.v1 contract fails
// loudly (the browser's own client.ts schema/semantic validation rejects an
// invalid mock response the same way it would reject a bad server response).
//
// Scenario selection is per-request, not shared global mutable state: the
// Playwright spec encodes which canned answer to return as a
// "[[ask-dev:<scenario>]] " prefix on the question text it types into the
// composer, and this module strips it before building the transcript/answer
// text. That keeps concurrently-running spec files from racing over a
// single shared "current scenario" variable — the exact hazard the
// pre-existing pagerduty/entitlement scenario globals accept by forcing a
// dedicated `workers: 1` Playwright project (see playwright.config.ts). The
// one exception is capabilities (`getCapabilities()` takes no per-request
// input at all), which does use a small shared mutable flag; CI already runs
// every project with `workers: 1` at the top level, so that shared state is
// safe for the gate even though a fully parallel local run could race it.
import { randomUUID } from "node:crypto";

import answerFixture from "../../src/lib/dev/contracts/examples/positive/dev_answer.v1.json";
import capabilitiesFixture from "../../src/lib/dev/contracts/examples/positive/dev_capabilities.v1.json";
import { ASK_DEV_OUTCOME_TABLE, outcomeCase } from "../fixtures/askDevOutcomes";

type JsonRecord = Record<string, unknown>;

function clone<T>(value: T): T {
    return structuredClone(value);
}

const OUTCOME_TABLE_KEYS = ASK_DEV_OUTCOME_TABLE.map((entry) => entry.key);

export type DevAnswerScenario =
    | (typeof ASK_DEV_OUTCOME_TABLE)[number]["key"]
    | "needs_clarification"
    | "forbidden_or_not_found_scope"
    | "scope_forbidden_error"
    | "source_unavailable_error";

const SCENARIO_MARKER = /^\[\[ask-dev:([a-z_]+)\]\]\s*/u;
const KNOWN_SCENARIOS: ReadonlySet<string> = new Set<DevAnswerScenario>([
    ...OUTCOME_TABLE_KEYS,
    "needs_clarification",
    "forbidden_or_not_found_scope",
    "scope_forbidden_error",
    "source_unavailable_error",
]);

export function parseScenario(question: string): {
    scenario: DevAnswerScenario;
    visibleQuestion: string;
} {
    const match = SCENARIO_MARKER.exec(question);
    const scenario =
        match && KNOWN_SCENARIOS.has(match[1]!) ? (match[1] as DevAnswerScenario) : "complete";
    return { scenario, visibleQuestion: match ? question.slice(match[0].length) : question };
}

let answerCounter = 0;
let evidenceCounter = 0;

function nextAnswerId(): string {
    answerCounter += 1;
    return `answer_e2e_${answerCounter}`;
}

/** Builds one schema-valid dev_answer.v1 for the requested scenario. */
function buildAnswer(
    scenario: DevAnswerScenario,
    conversationId: string,
    visibleQuestion: string,
): JsonRecord {
    const base = clone(answerFixture) as JsonRecord;
    base.answer_id = nextAnswerId();
    base.conversation_id = conversationId;
    const nowIso = new Date().toISOString();
    base.as_of = nowIso;
    base.generated_at = nowIso;

    if ((OUTCOME_TABLE_KEYS as readonly string[]).includes(scenario)) {
        const outcome = outcomeCase(scenario);
        base.status = outcome.status;
        base.direct_summary = outcome.directSummary;
        if (outcome.emptyEvidence) {
            base.claims = [];
            base.evidence = [];
            base.metrics = [];
            base.suggested_follow_up_questions = [];
        }
        // Scenario-specific coverage/warning detail beyond what the shared
        // table encodes (the table only owns status + summary + caption,
        // per its own header comment).
        if (scenario === "partial") {
            (base.coverage as JsonRecord) = {
                ...(base.coverage as JsonRecord),
                available_source_count: 9,
                required_source_count: 12,
                unavailable_required_sources: ["deployments"],
            };
            base.warnings = ["Deployment evidence was unavailable for part of the window."];
        } else if (scenario === "degraded") {
            (base.coverage as JsonRecord) = {
                ...(base.coverage as JsonRecord),
                stale_required_sources: ["work_graph"],
            };
            base.warnings = ["Work graph data is stale for part of the requested window."];
        } else if (scenario === "insufficient_evidence") {
            (base.coverage as JsonRecord) = {
                ...(base.coverage as JsonRecord),
                available_source_count: 0,
                required_source_count: 1,
                unavailable_required_sources: ["work_graph"],
            };
        }
        return base;
    }

    switch (scenario) {
        case "needs_clarification": {
            base.direct_summary =
                "More than one match was found for this question. Choose the one you meant.";
            const resolvedScope = base.resolved_scope as JsonRecord;
            resolvedScope.outcome = "ambiguous";
            resolvedScope.resolved_scope = null;
            resolvedScope.authorized_repository_ids = [];
            resolvedScope.authorized_entity_ids = [];
            resolvedScope.candidates = [
                {
                    entity_ref: {
                        entity_id: "repo_dev_health",
                        entity_type: "repository",
                        display_label: "dev-health (this repository)",
                        repository_id: null,
                    },
                    reason: `Matches "${visibleQuestion.trim().slice(0, 40)}" by name`,
                },
                {
                    entity_ref: {
                        entity_id: "repo_dev_health_web",
                        entity_type: "repository",
                        display_label: "dev-health-web",
                        repository_id: null,
                    },
                    reason: "Also matches by name",
                },
            ];
            return base;
        }
        case "forbidden_or_not_found_scope": {
            // A real, reachable ScopeResolutionOutcome (contracts.py
            // `ScopeResolutionOutcome.FORBIDDEN_OR_NOT_FOUND`) — the exact
            // internal value AskDevAnswer.tsx:333 currently renders raw
            // (`scopeResolution.outcome.replaceAll("_", " ")`). Public
            // copy must never disclose which of "forbidden" or "not found"
            // applies (that would itself leak hidden-entity existence).
            base.direct_summary = "No authorized match was found for this question.";
            const resolvedScope = base.resolved_scope as JsonRecord;
            resolvedScope.outcome = "forbidden_or_not_found";
            resolvedScope.resolved_scope = null;
            resolvedScope.authorized_repository_ids = [];
            resolvedScope.authorized_entity_ids = [];
            resolvedScope.candidates = [];
            return base;
        }
        default:
            return base;
    }
}

let runCounter = 0;

function nextRunId(): string {
    runCounter += 1;
    return `run_e2e_${runCounter}`;
}

/** Builds one schema-valid, semantically-valid dev_stream_event.v1[] run. */
export function buildStreamEvents(
    scenario: DevAnswerScenario,
    conversationId: string,
    visibleQuestion: string,
): JsonRecord[] {
    const runId = nextRunId();
    const occurredAt = new Date().toISOString();
    let sequence = 0;
    const events: JsonRecord[] = [];
    const push = (event: JsonRecord) => {
        events.push({
            answer: null,
            delta: null,
            error: null,
            progress: null,
            scope_resolution: null,
            terminal_kind: null,
            warning: null,
            schema_version: "dev_stream_event.v1",
            run_id: runId,
            occurred_at: occurredAt,
            sequence: sequence++,
            ...event,
        });
    };

    push({ event: "run.started" });
    push({ event: "progress", progress: "resolving_scope" });
    push({ event: "progress", progress: "checking_evidence" });

    if (scenario === "scope_forbidden_error" || scenario === "source_unavailable_error") {
        const error =
            scenario === "scope_forbidden_error"
                ? {
                      code: "scope_forbidden",
                      request_id: randomUUID(),
                      retryable: false,
                      safe_message: "You don't have access to that scope.",
                      schema_version: "dev_error.v1",
                  }
                : {
                      code: "source_unavailable",
                      remediation: ["Retry after source health recovers."],
                      request_id: randomUUID(),
                      retryable: true,
                      safe_message: "A required source is temporarily unavailable.",
                      schema_version: "dev_error.v1",
                  };
        push({ event: "error", error });
        push({ event: "done", terminal_kind: "error" });
        return events;
    }

    push({ event: "answer.delta", delta: "Checking the evidence in this scope… " });
    const answer = buildAnswer(scenario, conversationId, visibleQuestion);
    push({ event: "answer.completed", answer });
    push({ event: "done", terminal_kind: "answer" });
    return events;
}

export function encodeSseFrames(events: readonly JsonRecord[]): string {
    return events
        .map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`)
        .join("");
}

// --- Capabilities (shared mutable state; see module comment) ---------------

export type DevCapabilitiesState = "ready" | "not_ready" | "disabled";
let capabilitiesState: DevCapabilitiesState = "ready";

export function setDevCapabilitiesState(state: string): boolean {
    if (state !== "ready" && state !== "not_ready" && state !== "disabled") return false;
    capabilitiesState = state;
    return true;
}

export function getDevCapabilitiesResponse(): JsonRecord {
    const base = clone(capabilitiesFixture) as JsonRecord;
    if (capabilitiesState === "disabled") {
        return { ...base, ask_dev: false, can_read: false, readiness: "disabled" };
    }
    if (capabilitiesState === "not_ready") {
        return {
            ...base,
            ask_dev: true,
            can_read: true,
            readiness: "missing_credentials",
            administrator_safe_failure_reason:
                "Ask Dev is enabled, but an administrator needs to finish provider setup.",
        };
    }
    return { ...base, ask_dev: true, can_read: true, can_manage: true, readiness: "ready" };
}

// --- Conversation store ------------------------------------------------

type StoredConversation = {
    conversation: JsonRecord;
    items: JsonRecord[];
    seenClientMessageIds: Map<string, JsonRecord>;
};

const conversations = new Map<string, StoredConversation>();

// Request counters exposed at /__test/dev-requests so specs can assert "no
// provider call/page-data transmission occurs merely from opening a
// surface" and "one message/run is created under duplicate click" without
// guessing at network timing.
let messagesRequestCount = 0;
let conversationsCreatedCount = 0;

export function recordMessagesRequest(): void {
    messagesRequestCount += 1;
}

export function recordConversationCreated(): void {
    conversationsCreatedCount += 1;
}

export function getDevRequestCounts(): { messages: number; conversationsCreated: number } {
    return { messages: messagesRequestCount, conversationsCreated: conversationsCreatedCount };
}

export function resetDevMockState(): void {
    conversations.clear();
    messagesRequestCount = 0;
    conversationsCreatedCount = 0;
    capabilitiesState = "ready";
    answerCounter = 0;
    runCounter = 0;
    evidenceCounter = 0;
}

export function createConversation(currentScope: unknown, title: unknown): JsonRecord {
    const conversationId = `conversation_e2e_${randomUUID()}`;
    const nowIso = new Date().toISOString();
    const conversation: JsonRecord = {
        conversation_id: conversationId,
        created_at: nowIso,
        updated_at: nowIso,
        current_scope: currentScope,
        expires_at: null,
        latest_answer_id: null,
        message_count: 0,
        retention_days: 30,
        schema_version: "dev_conversation.v1",
        state: "active",
        title: typeof title === "string" ? title : null,
    };
    conversations.set(conversationId, {
        conversation,
        items: [],
        seenClientMessageIds: new Map(),
    });
    recordConversationCreated();
    return clone(conversation);
}

export function getConversation(conversationId: string): JsonRecord | null {
    const stored = conversations.get(conversationId);
    return stored ? clone(stored.conversation) : null;
}

export function listConversations(): JsonRecord[] {
    return [...conversations.values()]
        .sort(
            (a, b) =>
                Date.parse(String(b.conversation.updated_at)) -
                Date.parse(String(a.conversation.updated_at)),
        )
        .map((stored) => ({
            conversation_id: stored.conversation.conversation_id,
            direct_scope: (stored.conversation.current_scope as JsonRecord).direct_scope,
            expires_at: stored.conversation.expires_at,
            message_count: stored.conversation.message_count,
            schema_version: "dev_conversation_summary.v1",
            state: stored.conversation.state,
            title: stored.conversation.title,
            updated_at: stored.conversation.updated_at,
        }));
}

export function renameConversation(
    conversationId: string,
    title: string | null,
): JsonRecord | null {
    const stored = conversations.get(conversationId);
    if (!stored) return null;
    stored.conversation.title = title;
    stored.conversation.updated_at = new Date().toISOString();
    return clone(stored.conversation);
}

export function deleteConversation(conversationId: string): boolean {
    return conversations.delete(conversationId);
}

export function getTranscript(conversationId: string): JsonRecord | null {
    const stored = conversations.get(conversationId);
    if (!stored) return null;
    return {
        conversation_id: conversationId,
        items: clone(stored.items),
        next_cursor: null,
        schema_version: "dev_conversation_transcript.v1",
    };
}

/**
 * Applies one message/run to a stored conversation and returns its SSE
 * frames. Replays the identical prior frames for a repeated
 * `client_message_id` on the same conversation instead of appending another
 * transcript entry — the deterministic proxy for "one message/run is
 * created under duplicate click, ... reconnect, retry" without a real
 * network layer to actually drop the duplicate request.
 */
export function applyMessage(
    conversationId: string,
    clientMessageId: string,
    rawQuestion: string,
    scope: unknown,
): { frames: string; replayed: boolean } | null {
    const stored = conversations.get(conversationId);
    if (!stored) return null;
    recordMessagesRequest();

    const existing = stored.seenClientMessageIds.get(clientMessageId);
    if (existing) {
        return { frames: encodeSseFrames(existing.events as JsonRecord[]), replayed: true };
    }

    const { scenario, visibleQuestion } = parseScenario(rawQuestion);
    const events = buildStreamEvents(scenario, conversationId, visibleQuestion);
    stored.seenClientMessageIds.set(clientMessageId, { events });

    const nowIso = new Date().toISOString();
    const runId = String((events[0] as JsonRecord).run_id);
    const terminal = events.find(
        (event) => event.event === "answer.completed" || event.event === "error",
    ) as JsonRecord | undefined;
    const runState =
        terminal?.event === "answer.completed"
            ? "completed"
            : terminal?.event === "error"
              ? "failed"
              : "failed";

    stored.items.push({
        answer: null,
        created_at: nowIso,
        message_id: `message_e2e_${randomUUID()}`,
        question: rawQuestion,
        retry_of_run_id: null,
        role: "user",
        run_id: runId,
        run_state: runState,
        schema_version: "dev_transcript_entry.v1",
        scope,
    });
    if (terminal?.event === "answer.completed") {
        const answer = terminal.answer as JsonRecord;
        stored.items.push({
            answer,
            created_at: nowIso,
            message_id: `message_e2e_${randomUUID()}`,
            question: null,
            retry_of_run_id: null,
            role: "assistant",
            run_id: runId,
            run_state: runState,
            schema_version: "dev_transcript_entry.v1",
            scope: null,
        });
        stored.conversation.latest_answer_id = answer.answer_id;
    }
    stored.conversation.message_count = (stored.conversation.message_count as number) + 1;
    stored.conversation.updated_at = nowIso;

    return { frames: encodeSseFrames(events), replayed: false };
}

export function expandEvidence(evidenceRefId: string, answerId: string): JsonRecord {
    evidenceCounter += 1;
    const safeExcerpt = `UNTRUSTED_DATA\nEvidence excerpt ${evidenceCounter} for ${answerId}\nEND_UNTRUSTED_DATA`;
    return {
        evidence: {
            citation_text: "The contract implementation remains in progress.",
            confidence: 1,
            display_label: "Implement contract baseline",
            entity_id: "item_01",
            entity_type: "work_item",
            evidence_ref_id: evidenceRefId,
            flags: {
                conflicting: false,
                deleted: false,
                redacted: false,
                stale: false,
                unavailable: false,
                uncertain: false,
                untrusted_content: true,
            },
            freshness: "fresh",
            link: { internal_path: "/work/items/item_01", source_url: null },
            observed_at: "2026-07-28T12:00:00Z",
            provenance: "Canonical work graph projection",
            repository_ids: ["repo_dev_health"],
            schema_version: "dev_evidence_ref.v1",
            source_system: "work_graph",
            source_version: "work_graph.v1",
            valid_entity_ids: ["item_01"],
        },
        query_version: "get_evidence.v1",
        safe_excerpt: safeExcerpt,
        schema_version: "dev_evidence_expansion.v1",
        // Must equal the byte length of `safe_excerpt` itself (the whole
        // UNTRUSTED_DATA-wrapped string), not just its inner text — the
        // client's semantic validator (contractValidation.ts) rejects the
        // response otherwise, exactly the kind of drift this deterministic
        // mock is supposed to force out into the open.
        serialized_bytes: new TextEncoder().encode(safeExcerpt).byteLength,
        state: "available",
        warning: null,
    };
}

export function submitFeedback(answerId: string, rating: string, reasons: unknown): JsonRecord {
    return {
        answer_id: answerId,
        comment: null,
        created_at: new Date().toISOString(),
        feedback_id: `feedback_e2e_${randomUUID()}`,
        rating,
        reasons: Array.isArray(reasons) ? reasons : [],
        schema_version: "dev_feedback.v1",
    };
}
