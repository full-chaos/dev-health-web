import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import * as streamEnvelopeValidators from "@/lib/acr/streamEnvelopeValidators";
import * as streamValidators from "@/lib/acr/streamValidators";
import type { AcrAccessToken, AcrSilentOutcome } from "@/lib/ask-dev/acr-auth";
import type { AcrBrowserClientConfig } from "@/lib/ask-dev/acr-browser-config";

import type { InvestigateCall } from "@/components/ask-dev/conversation/transport";

import { createAcrBrowserTransport } from "../browserTransport";

/**
 * CHAOS-12104 (T14a): web's own part of the browser's ACR transport, against a fake `fetch`.
 *
 * The transport itself is ask-dev's (`createAcrCalls`, pinned): its request, deadline, caps,
 * grammar, refusal, status, replay and 401 tests live in ask-dev's `src/acr-client/__tests__/`
 * (CHAOS-12613). What stays here is what web adds: its views of the result (`isResult`).
 */

const ISSUER = "https://acr.example.test";
const CONFIG: AcrBrowserClientConfig = {
    issuer: ISSUER,
    webOrigin: "https://web.example.test",
    clientId: "https://web.example.test/oauth/acr-client.json",
    redirectUri: "https://web.example.test/ask-dev/oauth/callback",
    usesMetadataDocument: true,
};
const TOKEN = "fcacr_test_token_0000000000000000000000000000000";
const T0 = 1_800_000_000_000;

let token: AcrAccessToken;
let fetchMock: ReturnType<typeof vi.fn>;
/** What the silent step answers; off, so a test here sees "authorization required" (CHAOS-12474). */
const authorizeAnswer = (): AcrSilentOutcome => ({ kind: "off" });

const jsonResponse = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });

beforeEach(() => {
    token = { kind: "token", token: TOKEN, issuer: ISSUER };
    fetchMock = vi.fn();
});

describe("web's views of the result", () => {
    function transportWith(validators: () => Promise<typeof streamValidators>) {
        return createAcrBrowserTransport(CONFIG, {
            fetch: fetchMock as unknown as typeof fetch,
            now: () => T0,
            token: () => token,
            rejected: () => undefined,
            authorize: async () => authorizeAnswer(),
            envelope: streamEnvelopeValidators,
            validators,
        });
    }

    it("a result that passes the checks but that web's views cannot read is refused", async () => {
        const open = {
            ...streamValidators,
            validateInvestigationResultV1: () => true,
            validateInvestigationResultV2: () => true,
        };
        fetchMock.mockResolvedValue(jsonResponse({ status: "unread" }, 200));
        await expect(
            transportWith(async () => open).readResult("result_x", new AbortController().signal),
        ).rejects.toMatchObject({ reason: "invalid_upstream" });
    });
});

// CHAOS-12643: ACR's bounded answer is a result the stream carries. Before, `isResult` read only a
// whole result, so the gate refused the event as `result_shape` and the turn failed.
describe("ACR's bounded answer on the stream", () => {
    const CAPTURE = join(__dirname, "captures/context_fabric_investigation_event_stream.v1.sse");
    const PROJECTION = JSON.parse(
        readFileSync(
            join(process.cwd(), "tests/fixtures/ask-dev/bounded-answers/bounded-answer.json"),
            "utf8",
        ),
    ) as { readonly schema_version: string; readonly result_id: string };

    const THREAD = "thread_bounded_test_0001";

    /** The captured `accepted` frame (on this test's thread), then a `result` frame with `result`. */
    function streamOf(result: unknown): { body: string; submissionId: string } {
        const captured = readFileSync(CAPTURE, "utf8")
            .split("\n")
            .find((line) => line.startsWith("data: ") && line.includes('"type":"accepted"'))!
            .slice("data: ".length);
        const accepted = {
            ...(JSON.parse(captured) as { request_id: string; submission_id: string }),
            thread_id: THREAD,
        };
        const acceptedData = JSON.stringify(accepted);
        const event = {
            schema_version: "context_fabric_investigation_event.v1",
            type: "result",
            request_id: accepted.request_id,
            seq: 2,
            result,
        };
        return {
            body: `id: 1\nevent: accepted\ndata: ${acceptedData}\n\nid: 2\nevent: result\ndata: ${JSON.stringify(event)}\n\n`,
            submissionId: accepted.submission_id,
        };
    }

    async function run(result: unknown) {
        const { body, submissionId } = streamOf(result);
        fetchMock.mockResolvedValue(
            new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
        );
        const transport = createAcrBrowserTransport(CONFIG, {
            fetch: fetchMock as unknown as typeof fetch,
            now: () => T0,
            token: () => token,
            rejected: () => undefined,
            authorize: async () => authorizeAnswer(),
            envelope: streamEnvelopeValidators,
            validators: async () => streamValidators,
        });
        const events: { type: string; result?: unknown }[] = [];
        for await (const event of transport.investigate({
            // The transport sends the request as given; this test reads only the stream.
            request: {
                request_id: "req_bounded_test",
                question: "Which teams are struggling?",
            } as InvestigateCall["request"],
            submissionId,
            threadId: THREAD,
            deadline: T0 + 120_000,
            signal: new AbortController().signal,
        })) {
            events.push(event as { type: string; result?: unknown });
        }
        return events;
    }

    it("carries a bounded answer to the store as a result", async () => {
        const events = await run(PROJECTION);
        const result = events.find((event) => event.type === "result")?.result as
            { schema_version?: string; result_id?: string } | undefined;
        expect(result?.schema_version).toBe("context_fabric_answer_projection.v1");
        expect(result?.result_id).toBe(PROJECTION.result_id);
    });

    it("still refuses a projection that fails its pinned schema", async () => {
        await expect(
            run({ schema_version: "context_fabric_answer_projection.v1", result_id: "result_x" }),
        ).rejects.toMatchObject({ reason: "invalid_upstream" });
    });
});
