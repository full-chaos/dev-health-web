import answerSchema from "./contracts/schemas/dev_answer.v1.schema.json";
import capabilitiesSchema from "./contracts/schemas/dev_capabilities.v1.schema.json";
import conversationSchema from "./contracts/schemas/dev_conversation.v1.schema.json";
import conversationSummarySchema from "./contracts/schemas/dev_conversation_summary.v1.schema.json";
import conversationTranscriptSchema from "./contracts/schemas/dev_conversation_transcript.v1.schema.json";
import evidenceExpansionSchema from "./contracts/schemas/dev_evidence_expansion.v1.schema.json";
import feedbackSchema from "./contracts/schemas/dev_feedback.v1.schema.json";
import streamEventSchema from "./contracts/schemas/dev_stream_event.v1.schema.json";
import { validateAskDevSemanticInvariants } from "./contractValidation";
import type {
    DevAnswer,
    DevCapabilities,
    DevConversation,
    DevConversationSummary,
    DevConversationTranscript,
    DevEvidenceExpansion,
    DevFeedback,
    DevMessageRequest,
    DevStreamEvent,
} from "./generated";
import { reportUnknownEnumValue, unknownPropertyReporter } from "./contractDrift";
import { validatePinnedJsonSchema } from "./jsonSchemaValidation";

export type DevWebError = Readonly<{
    schema_version: "dev_web_error.v1";
    code: string;
    safe_message: string;
    retryable: boolean;
    request_id?: string;
    limit_reset_at?: string;
}>;

export class DevApiError extends Error {
    readonly detail: DevWebError;
    readonly status: number;

    constructor(status: number, detail: DevWebError) {
        super(detail.safe_message);
        this.name = "DevApiError";
        this.status = status;
        this.detail = detail;
    }
}

export type DevRequestOptions = Readonly<{ signal?: AbortSignal }>;
export type DevStreamOptions = DevRequestOptions &
    Readonly<{ onEvent?: (event: DevStreamEvent) => void }>;

/**
 * The newest streamed contract this web pin can parse. The server uses the
 * request declaration to decide whether it may emit additive stream members
 * such as `graph.state`; keep the value tied to the generated v1 contract.
 */
export const PINNED_DEV_STREAM_CONTRACT_VERSION: DevStreamEvent["schema_version"] =
    "dev_stream_event.v1";
export type DevListConversationsOptions = DevRequestOptions &
    Readonly<{ cursor?: string; limit?: number }>;
export type DevConversationTranscriptOptions = DevRequestOptions &
    Readonly<{ cursor?: string; limit?: number }>;
export type DevConversationList = Readonly<{
    items: DevConversationSummary[];
    next_cursor: string | null;
}>;
export type DevConversationCreateInput = Readonly<{
    current_scope: DevMessageRequest["scope"];
    retention_days?: 0 | 30;
    title?: string | null;
}>;
export type DevConversationRenameInput = Readonly<{ title: string | null }>;
/**
 * The feedback request body.
 *
 * `rating` and `reasons` are DERIVED from the generated `dev_feedback.v1` types
 * rather than restated. They were previously hand-written copies of the same
 * unions, which meant a re-pin that added a reason (or a rating) kept compiling
 * against the stale vocabulary and the new member could never be sent -- the
 * exact drift the pinned-contract workflow exists to prevent, reintroduced one
 * layer above it.
 */
export type DevFeedbackInput = Readonly<{
    rating: DevFeedback["rating"];
    reasons: readonly DevFeedback["reasons"][number][];
    comment?: string | null;
}>;

/**
 * The pinned `dev_stream_event.v1` progress phase. Held as the generated
 * union rather than `string` so a re-pin that adds a phase puts compile-time
 * pressure on everything that maps one to display copy. `assertStreamEvent`
 * already rejects any phase outside the pinned enum, so widening this to
 * `string` bought no real tolerance — it only hid that pressure.
 */
export type DevProgressState = NonNullable<DevStreamEvent["progress"]>;

export type DevConversationStreamState = Readonly<{
    phase: "idle" | "running" | "completed" | "failed";
    runId: string | null;
    progress: DevProgressState | null;
    delta: string;
    answer: DevAnswer | null;
    error: DevWebError | null;
    warnings: string[];
}>;

export const initialDevConversationStreamState: DevConversationStreamState = Object.freeze({
    phase: "idle",
    runId: null,
    progress: null,
    delta: "",
    answer: null,
    error: null,
    warnings: [],
});

const validateAnswerSchema = (value: unknown) =>
    validatePinnedJsonSchema(value, answerSchema, unknownPropertyReporter("dev_answer.v1"));
const validateCapabilitiesSchema = (value: unknown) =>
    validatePinnedJsonSchema(
        value,
        capabilitiesSchema,
        unknownPropertyReporter("dev_capabilities.v1"),
    );
const validateConversationSchema = (value: unknown) =>
    validatePinnedJsonSchema(
        value,
        conversationSchema,
        unknownPropertyReporter("dev_conversation.v1"),
    );
const validateConversationSummarySchema = (value: unknown) =>
    validatePinnedJsonSchema(
        value,
        conversationSummarySchema,
        unknownPropertyReporter("dev_conversation_summary.v1"),
    );
const validateConversationTranscriptSchema = (value: unknown) =>
    validatePinnedJsonSchema(
        value,
        conversationTranscriptSchema,
        unknownPropertyReporter("dev_conversation_transcript.v1"),
    );
const validateEvidenceExpansionSchema = (value: unknown) =>
    validatePinnedJsonSchema(
        value,
        evidenceExpansionSchema,
        unknownPropertyReporter("dev_evidence_expansion.v1"),
    );
const validateStreamEventSchema = (value: unknown) =>
    validatePinnedJsonSchema(
        value,
        streamEventSchema,
        unknownPropertyReporter("dev_stream_event.v1"),
    );

/**
 * The stream event names this build understands, read from the pinned schema
 * rather than restated, so the tolerance below can never disagree with what the
 * validator accepts.
 */
const KNOWN_STREAM_EVENTS: ReadonlySet<string> = new Set(
    ((streamEventSchema as { $defs?: { StreamEventType?: { enum?: unknown } } }).$defs
        ?.StreamEventType?.enum ?? []) as readonly string[],
);

/**
 * `dev_feedback.v1` with the `reasons` member list relaxed.
 *
 * A rating echoed back carrying a reason this build's enum lacks is a stale pin,
 * not a corrupt response -- and rejecting it would fail a submission the server
 * accepted and stored. Every other feedback constraint (required fields, item
 * bounds, comment length) stays enforced; unrecognised members are reported.
 */
const feedbackSchemaRelaxedReasons = (() => {
    const clone = structuredClone(feedbackSchema) as {
        properties?: { reasons?: { items?: { enum?: unknown } } };
    };
    delete clone.properties?.reasons?.items?.enum;
    return clone;
})();

const KNOWN_FEEDBACK_REASONS: ReadonlySet<string> = new Set(
    ((feedbackSchema as { properties?: { reasons?: { items?: { enum?: unknown } } } }).properties
        ?.reasons?.items?.enum ?? []) as readonly string[],
);

const validateFeedbackSchema = (value: unknown) => {
    const valid = validatePinnedJsonSchema(
        value,
        feedbackSchemaRelaxedReasons,
        unknownPropertyReporter("dev_feedback.v1"),
    );
    if (!valid) return false;
    const reasons = (value as { reasons?: unknown }).reasons;
    if (Array.isArray(reasons)) {
        for (const member of reasons) {
            if (typeof member === "string" && !KNOWN_FEEDBACK_REASONS.has(member)) {
                reportUnknownEnumValue("dev_feedback.v1", "/reasons", member);
            }
        }
    }
    return true;
};

function fromStreamError(event: DevStreamEvent): DevWebError | null {
    if (!event.error) return null;
    return {
        schema_version: "dev_web_error.v1",
        code: event.error.code,
        safe_message: event.error.safe_message,
        retryable: event.error.retryable,
        request_id: event.error.request_id,
        ...(event.error.limit_reset_at ? { limit_reset_at: event.error.limit_reset_at } : {}),
    };
}

export function reduceDevConversationStream(
    state: DevConversationStreamState,
    event: DevStreamEvent,
): DevConversationStreamState {
    switch (event.event) {
        case "run.started":
            return { ...initialDevConversationStreamState, phase: "running", runId: event.run_id };
        case "progress":
            return { ...state, phase: "running", progress: event.progress ?? null };
        case "answer.delta":
            return { ...state, phase: "running", delta: `${state.delta}${event.delta ?? ""}` };
        case "warning":
            return event.warning
                ? { ...state, warnings: [...state.warnings, event.warning] }
                : state;
        case "answer.completed":
            return { ...state, phase: "completed", answer: event.answer ?? null };
        case "error":
            return { ...state, phase: "failed", error: fromStreamError(event) };
        default:
            return state;
    }
}

function invalidResponse(message = "Ask Dev returned an invalid response."): DevApiError {
    return new DevApiError(502, {
        schema_version: "dev_web_error.v1",
        code: "invalid_response",
        safe_message: message,
        retryable: true,
    });
}

function assertCompletedAnswer(value: unknown): asserts value is DevAnswer {
    if (!validateAnswerSchema(value) || !validateAskDevSemanticInvariants(value)) {
        throw invalidResponse();
    }
}

function assertCapabilities(value: unknown): asserts value is DevCapabilities {
    if (!validateCapabilitiesSchema(value) || !validateAskDevSemanticInvariants(value)) {
        throw invalidResponse("Ask Dev returned invalid capability information.");
    }
}

function assertConversation(
    value: unknown,
    expectedConversationId?: string,
): asserts value is DevConversation {
    const conversationId =
        value && typeof value === "object" && !Array.isArray(value)
            ? (value as { conversation_id?: unknown }).conversation_id
            : undefined;
    if (
        !validateConversationSchema(value) ||
        !validateAskDevSemanticInvariants(value) ||
        (expectedConversationId !== undefined && conversationId !== expectedConversationId)
    ) {
        throw invalidResponse("Ask Dev returned an invalid conversation.");
    }
}

function assertConversationList(value: unknown): asserts value is DevConversationList {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw invalidResponse("Ask Dev returned an invalid conversation list.");
    }
    const candidate = value as Record<string, unknown>;
    const keys = Object.keys(candidate);
    const items = candidate.items;
    const nextCursor = candidate.next_cursor;
    if (
        keys.some((key) => key !== "items" && key !== "next_cursor") ||
        !Object.hasOwn(candidate, "items") ||
        !Object.hasOwn(candidate, "next_cursor") ||
        !Array.isArray(items) ||
        items.length > 100 ||
        !items.every(
            (item) =>
                validateConversationSummarySchema(item) && validateAskDevSemanticInvariants(item),
        ) ||
        (nextCursor !== null && typeof nextCursor !== "string")
    ) {
        throw invalidResponse("Ask Dev returned an invalid conversation list.");
    }
}

function assertEvidenceExpansion(
    value: unknown,
    expectedEvidenceRefId: string,
): asserts value is DevEvidenceExpansion {
    const evidenceRefId =
        value && typeof value === "object" && !Array.isArray(value)
            ? (value as { evidence?: { evidence_ref_id?: unknown } }).evidence?.evidence_ref_id
            : undefined;
    if (
        !validateEvidenceExpansionSchema(value) ||
        !validateAskDevSemanticInvariants(value) ||
        evidenceRefId !== expectedEvidenceRefId
    ) {
        throw invalidResponse("Ask Dev returned invalid evidence.");
    }
}

function assertFeedback(value: unknown, expectedAnswerId: string): asserts value is DevFeedback {
    const answerId =
        value && typeof value === "object" && !Array.isArray(value)
            ? (value as { answer_id?: unknown }).answer_id
            : undefined;
    if (
        !validateFeedbackSchema(value) ||
        !validateAskDevSemanticInvariants(value) ||
        answerId !== expectedAnswerId
    ) {
        throw invalidResponse("Ask Dev returned invalid feedback.");
    }
}

function assertStreamEvent(value: unknown): asserts value is DevStreamEvent {
    if (!validateStreamEventSchema(value) || !validateAskDevSemanticInvariants(value)) {
        throw invalidResponse("Ask Dev returned an invalid stream event.");
    }
}

function assertConversationTranscript(
    value: unknown,
    conversationId: string,
): asserts value is DevConversationTranscript {
    const responseConversationId =
        value && typeof value === "object" && !Array.isArray(value)
            ? (value as { conversation_id?: unknown }).conversation_id
            : undefined;
    if (
        !validateConversationTranscriptSchema(value) ||
        !validateAskDevSemanticInvariants(value) ||
        responseConversationId !== conversationId
    ) {
        throw invalidResponse("Ask Dev returned an invalid conversation transcript.");
    }
}

function decodeFrame(frame: string): { eventName: string; value: unknown } {
    const lines = frame.split(/\r?\n/u);
    let eventName: string | undefined;
    let data: string | undefined;
    for (const line of lines) {
        if (line.startsWith("event: ") && eventName === undefined) {
            eventName = line.slice(7);
        } else if (line.startsWith("data: ") && data === undefined) {
            data = line.slice(6);
        } else if (line !== "") {
            throw invalidResponse("Ask Dev returned a malformed stream.");
        }
    }
    if (
        !eventName ||
        data === undefined ||
        new TextEncoder().encode(data).byteLength > 2 * 1024 * 1024
    ) {
        throw invalidResponse("Ask Dev returned a malformed stream.");
    }
    try {
        return { eventName, value: JSON.parse(data) };
    } catch {
        throw invalidResponse("Ask Dev returned malformed stream data.");
    }
}

/**
 * Whether a decoded frame names an event this build does not understand.
 *
 * Deliberately narrow: the frame must still be an object carrying a STRING
 * event name that simply is not in the pinned vocabulary. Anything else (a
 * non-object payload, a missing or non-string name, a name that disagrees with
 * the SSE `event:` line) is malformed rather than merely newer, and must keep
 * failing.
 */
function isUnknownStreamEvent(decoded: { eventName: string; value: unknown }): boolean {
    if (typeof decoded.value !== "object" || decoded.value === null) return false;
    const name = (decoded.value as { event?: unknown }).event;
    if (typeof name !== "string" || name !== decoded.eventName) return false;
    return !KNOWN_STREAM_EVENTS.has(name);
}

export async function consumeDevSseStream(
    response: Response,
    options: DevStreamOptions = {},
): Promise<DevAnswer> {
    if (!response.ok) throw await responseError(response);
    if (!response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) {
        throw invalidResponse();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "";
    let count = 0;
    let runId: string | undefined;
    let expectedSequence = 0;
    let terminal: "answer" | "error" | undefined;
    let terminalError: DevWebError | undefined;
    let answer: DevAnswer | undefined;
    let done = false;

    const consumeFrame = (frame: string): void => {
        const decoded = decodeFrame(frame);
        // FORWARD COMPATIBILITY: an event name this build does not know is a
        // server ahead of our pin, not a corrupt stream. Ignoring it must still
        // CONSUME its sequence number, or every later frame reads as
        // out-of-order and the run dies for a different reason.
        //
        // Only tolerated once the run has properly started: a stream whose
        // FIRST frame is unrecognised tells us nothing about the run at all, so
        // that stays a hard failure rather than a run with no identity.
        if (isUnknownStreamEvent(decoded)) {
            if (runId === undefined || done) {
                throw invalidResponse("Ask Dev stream did not start correctly.");
            }
            const unknown = decoded.value as { run_id?: unknown; sequence?: unknown };
            if (unknown.sequence !== expectedSequence || unknown.run_id !== runId) {
                throw invalidResponse("Ask Dev returned an out-of-order stream.");
            }
            reportUnknownEnumValue("dev_stream_event.v1", "/event", decoded.eventName);
            expectedSequence += 1;
            count += 1;
            if (count > 100_000) throw invalidResponse("Ask Dev returned too many stream events.");
            return;
        }
        assertStreamEvent(decoded.value);
        const event = decoded.value;
        if (decoded.eventName !== event.event || done || event.sequence !== expectedSequence) {
            throw invalidResponse("Ask Dev returned an out-of-order stream.");
        }
        expectedSequence += 1;
        count += 1;
        if (count > 100_000) throw invalidResponse("Ask Dev returned too many stream events.");
        if (runId === undefined) {
            if (event.event !== "run.started")
                throw invalidResponse("Ask Dev stream did not start correctly.");
            runId = event.run_id;
        } else if (event.run_id !== runId) {
            throw invalidResponse("Ask Dev changed run identifiers mid-stream.");
        }
        if (terminal !== undefined && event.event !== "done") {
            throw invalidResponse("Ask Dev returned data after its terminal event.");
        }
        if (event.event === "answer.completed") {
            if (terminal !== undefined || !event.answer) throw invalidResponse();
            assertCompletedAnswer(event.answer);
            answer = event.answer;
            terminal = "answer";
        } else if (event.event === "error") {
            if (terminal !== undefined || !event.error) throw invalidResponse();
            terminalError = fromStreamError(event) ?? undefined;
            terminal = "error";
        } else if (event.event === "done") {
            if (terminal === undefined || event.terminal_kind !== terminal) throw invalidResponse();
            done = true;
        }
        options.onEvent?.(event);
    };

    try {
        while (true) {
            if (options.signal?.aborted) throw options.signal.reason;
            const { done: readerDone, value } = await reader.read();
            if (readerDone) break;
            buffer += decoder.decode(value, { stream: true });
            if (new TextEncoder().encode(buffer).byteLength > 3 * 1024 * 1024) {
                throw invalidResponse("Ask Dev returned an oversized stream frame.");
            }
            const frames = buffer.split(/\r?\n\r?\n/u);
            buffer = frames.pop() ?? "";
            for (const frame of frames) if (frame) consumeFrame(frame);
        }
        buffer += decoder.decode();
        if (buffer.trim()) consumeFrame(buffer);
    } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    }
    if (!done || terminal !== "answer" || !answer) {
        if (terminal === "error") {
            throw new DevApiError(
                502,
                terminalError ?? {
                    schema_version: "dev_web_error.v1",
                    code: "stream_failed",
                    safe_message: "Ask Dev could not complete the request.",
                    retryable: true,
                },
            );
        }
        throw invalidResponse("Ask Dev stream ended before a completed answer.");
    }
    return answer;
}

function isWebError(value: unknown): value is DevWebError {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    return (
        candidate.schema_version === "dev_web_error.v1" &&
        typeof candidate.code === "string" &&
        typeof candidate.safe_message === "string" &&
        typeof candidate.retryable === "boolean" &&
        (!Object.hasOwn(candidate, "limit_reset_at") ||
            typeof candidate.limit_reset_at === "string")
    );
}

async function responseError(response: Response): Promise<DevApiError> {
    try {
        const value: unknown = await response.json();
        if (isWebError(value)) {
            return new DevApiError(response.status, {
                schema_version: "dev_web_error.v1",
                code: value.code,
                safe_message: value.safe_message,
                retryable: value.retryable,
                ...(typeof value.request_id === "string" ? { request_id: value.request_id } : {}),
                ...(typeof value.limit_reset_at === "string"
                    ? { limit_reset_at: value.limit_reset_at }
                    : {}),
            });
        }
    } catch {
        // Normalize every non-contract response without exposing server content.
    }
    return new DevApiError(response.status, {
        schema_version: "dev_web_error.v1",
        code: "request_failed",
        safe_message: "Ask Dev is temporarily unavailable.",
        retryable: response.status >= 500,
    });
}

async function readJson(response: Response): Promise<unknown> {
    if (!response.ok) throw await responseError(response);
    try {
        return await response.json();
    } catch {
        throw invalidResponse();
    }
}

function encodeId(value: string): string {
    return encodeURIComponent(value);
}

export interface DevApiClient {
    getCapabilities(options?: DevRequestOptions): Promise<DevCapabilities>;
    listConversations(options?: DevListConversationsOptions): Promise<DevConversationList>;
    createConversation(
        input: DevConversationCreateInput,
        options?: DevRequestOptions,
    ): Promise<DevConversation>;
    getConversation(conversationId: string, options?: DevRequestOptions): Promise<DevConversation>;
    getConversationTranscript(
        conversationId: string,
        options?: DevConversationTranscriptOptions,
    ): Promise<DevConversationTranscript>;
    renameConversation(
        conversationId: string,
        input: DevConversationRenameInput,
        options?: DevRequestOptions,
    ): Promise<DevConversation>;
    deleteConversation(conversationId: string, options?: DevRequestOptions): Promise<void>;
    streamMessage(
        conversationId: string,
        input: DevMessageRequest,
        options?: DevStreamOptions,
    ): Promise<DevAnswer>;
    expandEvidence(
        evidenceRefId: string,
        answerId: string,
        options?: DevRequestOptions,
    ): Promise<DevEvidenceExpansion>;
    submitFeedback(
        answerId: string,
        input: DevFeedbackInput,
        options?: DevRequestOptions,
    ): Promise<DevFeedback>;
}

type ClientOptions = Readonly<{ fetch?: typeof fetch }>;

export function createDevApiClient(options: ClientOptions = {}): DevApiClient {
    const request = options.fetch ?? globalThis.fetch;
    const jsonMutation = (method: string, body: unknown, signal?: AbortSignal): RequestInit => ({
        method,
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal,
    });
    return {
        async getCapabilities({ signal } = {}) {
            const value: unknown = await readJson(
                await request("/api/v1/dev/capabilities", { cache: "no-store", signal }),
            );
            assertCapabilities(value);
            return value;
        },
        async listConversations({ cursor, limit, signal } = {}) {
            const query = new URLSearchParams();
            if (cursor) query.set("cursor", cursor);
            if (limit !== undefined) query.set("limit", String(limit));
            const suffix = query.size ? `?${query}` : "";
            const value = await readJson(
                await request(`/api/v1/dev/conversations${suffix}`, { cache: "no-store", signal }),
            );
            assertConversationList(value);
            return value;
        },
        async createConversation(input, { signal } = {}) {
            const value = await readJson(
                await request("/api/v1/dev/conversations", jsonMutation("POST", input, signal)),
            );
            assertConversation(value);
            return value;
        },
        async getConversation(conversationId, { signal } = {}) {
            const value = await readJson(
                await request(`/api/v1/dev/conversations/${encodeId(conversationId)}`, {
                    cache: "no-store",
                    signal,
                }),
            );
            assertConversation(value, conversationId);
            return value;
        },
        async getConversationTranscript(conversationId, { cursor, limit, signal } = {}) {
            const query = new URLSearchParams();
            if (cursor) query.set("cursor", cursor);
            if (limit !== undefined) query.set("limit", String(limit));
            const suffix = query.size ? `?${query}` : "";
            const value: unknown = await readJson(
                await request(
                    `/api/v1/dev/conversations/${encodeId(conversationId)}/transcript${suffix}`,
                    { cache: "no-store", signal },
                ),
            );
            assertConversationTranscript(value, conversationId);
            return value;
        },
        async renameConversation(conversationId, input, { signal } = {}) {
            const value = await readJson(
                await request(
                    `/api/v1/dev/conversations/${encodeId(conversationId)}`,
                    jsonMutation("PATCH", input, signal),
                ),
            );
            assertConversation(value, conversationId);
            return value;
        },
        async deleteConversation(conversationId, { signal } = {}) {
            const response = await request(
                `/api/v1/dev/conversations/${encodeId(conversationId)}`,
                {
                    method: "DELETE",
                    cache: "no-store",
                    signal,
                },
            );
            if (!response.ok) throw await responseError(response);
        },
        async streamMessage(conversationId, input, streamOptions = {}) {
            const response = await request(
                `/api/v1/dev/conversations/${encodeId(conversationId)}/messages`,
                jsonMutation(
                    "POST",
                    {
                        ...input,
                        client_contract_version: PINNED_DEV_STREAM_CONTRACT_VERSION,
                    },
                    streamOptions.signal,
                ),
            );
            return consumeDevSseStream(response, streamOptions);
        },
        async expandEvidence(evidenceRefId, answerId, { signal } = {}) {
            const query = new URLSearchParams({ answer_id: answerId });
            const value = await readJson(
                await request(`/api/v1/dev/evidence/${encodeId(evidenceRefId)}?${query}`, {
                    cache: "no-store",
                    signal,
                }),
            );
            assertEvidenceExpansion(value, evidenceRefId);
            return value;
        },
        async submitFeedback(answerId, input, { signal } = {}) {
            const value = await readJson(
                await request(
                    `/api/v1/dev/answers/${encodeId(answerId)}/feedback`,
                    jsonMutation("POST", input, signal),
                ),
            );
            assertFeedback(value, answerId);
            return value;
        },
    };
}

export const devApiClient = createDevApiClient();

export type {
    DevAnswer,
    DevCapabilities,
    DevConversation,
    DevConversationSummary,
    DevConversationTranscript,
    DevEvidenceExpansion,
    DevFeedback,
    DevMessageRequest,
    DevStreamEvent,
};
