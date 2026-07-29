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
import { validatePinnedJsonSchema } from "./jsonSchemaValidation";

export type DevWebError = Readonly<{
    schema_version: "dev_web_error.v1";
    code: string;
    safe_message: string;
    retryable: boolean;
    request_id?: string;
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
export type DevFeedbackInput = Readonly<{
    rating: "helpful" | "not_helpful";
    reasons: (
        "incorrect" | "missing_evidence" | "wrong_scope" | "stale_data" | "unclear" | "useful"
    )[];
    comment?: string | null;
}>;

export type DevConversationStreamState = Readonly<{
    phase: "idle" | "running" | "completed" | "failed";
    runId: string | null;
    progress: string | null;
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

const validateAnswerSchema = (value: unknown) => validatePinnedJsonSchema(value, answerSchema);
const validateCapabilitiesSchema = (value: unknown) =>
    validatePinnedJsonSchema(value, capabilitiesSchema);
const validateConversationSchema = (value: unknown) =>
    validatePinnedJsonSchema(value, conversationSchema);
const validateConversationSummarySchema = (value: unknown) =>
    validatePinnedJsonSchema(value, conversationSummarySchema);
const validateConversationTranscriptSchema = (value: unknown) =>
    validatePinnedJsonSchema(value, conversationTranscriptSchema);
const validateEvidenceExpansionSchema = (value: unknown) =>
    validatePinnedJsonSchema(value, evidenceExpansionSchema);
const validateFeedbackSchema = (value: unknown) => validatePinnedJsonSchema(value, feedbackSchema);
const validateStreamEventSchema = (value: unknown) =>
    validatePinnedJsonSchema(value, streamEventSchema);

function fromStreamError(event: DevStreamEvent): DevWebError | null {
    if (!event.error) return null;
    return {
        schema_version: "dev_web_error.v1",
        code: event.error.code,
        safe_message: event.error.safe_message,
        retryable: event.error.retryable,
        request_id: event.error.request_id,
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
        typeof candidate.retryable === "boolean"
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
                jsonMutation("POST", input, streamOptions.signal),
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
