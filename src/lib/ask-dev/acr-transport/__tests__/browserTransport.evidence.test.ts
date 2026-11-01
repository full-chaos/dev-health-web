import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { TransportFailure, TransportRefusal } from "@/components/ask-dev/conversation/transport";
import * as streamEnvelopeValidators from "@/lib/acr/streamEnvelopeValidators";
import * as streamValidators from "@/lib/acr/streamValidators";
import type { AcrAccessToken } from "@/lib/ask-dev/acr-auth";
import type { AcrBrowserClientConfig } from "@/lib/ask-dev/acr-browser-config";
import { logger } from "@/lib/logger";

import { createAcrBrowserTransport } from "../browserTransport";

/**
 * CHAOS-12105: one evidence reference, read from the browser, scoped to the result that cited it.
 * The body is ACR's own example at web's pin.
 */

const EXAMPLE = JSON.parse(
    readFileSync(
        join(process.cwd(), "src/lib/acr/contracts/examples/expanded_evidence.v1.json"),
        "utf8",
    ),
) as Record<string, unknown>;

const ISSUER = "https://acr.example.test";
const CONFIG: AcrBrowserClientConfig = {
    issuer: ISSUER,
    webOrigin: "https://web.example.test",
    clientId: "https://web.example.test/oauth/acr-client.json",
    redirectUri: "https://web.example.test/ask-dev/oauth/callback",
    usesMetadataDocument: true,
};
const TOKEN = "fcacr_test_token_0000000000000000000000000000000";
const NEXT_TOKEN = "fcacr_test_token_1111111111111111111111111111111";
/** A ref holds ":" and may hold "/" (a team id): ACR's mux and CORS read it as one segment. */
const REF = "acr:v1:team:ari:cloud:identity::team/1";
const RESULT = "result_a b&c";
const URL_OF_REF = `${ISSUER}/api/v1/agent-context/evidence/acr%3Av1%3Ateam%3Aari%3Acloud%3Aidentity%3A%3Ateam%2F1?result_id=result_a%20b%26c`;

const error = (code: string, status: number, retryable: boolean) => ({
    schema_version: "error.v1",
    request_id: "req_refused",
    error: { code, message: "refused", http_status: status, retryable },
});
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
    });

type Call = { readonly url: string; readonly init: RequestInit };

function harness(answers: Response[], tokens: AcrAccessToken[] = []) {
    const calls: Call[] = [];
    const rejected: string[] = [];
    let reads = 0;
    const access = (token: string): AcrAccessToken => ({ kind: "token", token, issuer: ISSUER });
    const transport = createAcrBrowserTransport(CONFIG, {
        fetch: (async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            return answers.shift() ?? new Response(null, { status: 599 });
        }) as unknown as typeof fetch,
        now: () => 1_800_000_000_000,
        token: () => {
            reads += 1;
            return tokens[reads - 1] ?? access(TOKEN);
        },
        rejected: (token) => rejected.push(token),
        authorize: async () => ({ kind: "off" }),
        envelope: streamEnvelopeValidators,
        validators: async () => streamValidators,
    });
    const read = (signal = new AbortController().signal) =>
        transport.readEvidence({ refId: REF, resultId: RESULT, signal });
    return { calls, rejected, read, access, transport };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("readEvidence", () => {
    it("sends one GET, on the agent-context route, scoped by result_id", async () => {
        const { calls, read } = harness([json(EXAMPLE)]);
        await read();
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(URL_OF_REF);
        expect(calls[0]!.url).not.toContain(TOKEN);
        expect(calls[0]!.init).toMatchObject({
            method: "GET",
            credentials: "omit",
            redirect: "error",
            cache: "no-store",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "X-ACR-Resource": ISSUER,
                Accept: "application/json",
            },
        });
    });

    it("two results that cite one ref ask for their own citation", async () => {
        const { calls, transport } = harness([json(EXAMPLE), json(EXAMPLE)]);
        const signal = new AbortController().signal;
        await transport.readEvidence({ refId: REF, resultId: "result_one", signal });
        await transport.readEvidence({ refId: REF, resultId: "result_two", signal });
        expect(calls.map((call) => new URL(call.url).searchParams.get("result_id"))).toEqual([
            "result_one",
            "result_two",
        ]);
    });

    it("maps the example to the view", async () => {
        const { read } = harness([json(EXAMPLE)]);
        await expect(read()).resolves.toEqual({
            refId: "ev_01J0ACR001",
            citation: "CHAOS-2924 requires organization- and repository-scoped ACR credentials.",
            excerpt:
                "Implement ACR client credentials and authorization in Go with organization and repository scope.",
            observedAt: "2026-07-10T14:00:00Z",
            availability: "available",
            structuredFields: { issue_id: "CHAOS-2924", status: "Backlog" },
        });
    });

    it("carries the served redaction reason, and a value of the open vocabulary", async () => {
        const { read } = harness([
            json({
                ...EXAMPLE,
                availability: "a_value_added_later",
                redaction_reason: "Removed at the source.",
            }),
        ]);
        await expect(read()).resolves.toMatchObject({
            availability: "a_value_added_later",
            redactionReason: "Removed at the source.",
        });
    });

    it("404 is null, with or without a body: one neutral answer", async () => {
        const withBody = harness([json(error("not_found", 404, false), 404)]);
        await expect(withBody.read()).resolves.toBeNull();
        const bare = harness([new Response(null, { status: 404 })]);
        await expect(bare.read()).resolves.toBeNull();
    });

    it("a body the contract refuses is invalid_upstream", async () => {
        const { read } = harness([json({ ...EXAMPLE, schema_version: "expanded_evidence.v2" })]);
        await expect(read()).rejects.toMatchObject({ reason: "invalid_upstream" });
    });

    it.each([
        [403, "access_denied", false],
        [409, "no_repository", false],
        [413, "invalid_request", false],
        [429, "rate_limited", true],
        [503, "upstream_unavailable", true],
    ] as const)("%i %s is a refusal that keeps ACR's body", async (status, code, retryable) => {
        const { read, calls } = harness([json(error(code, status, retryable), status)]);
        const refused = await read().catch((caught: unknown) => caught);
        expect(refused).toBeInstanceOf(TransportRefusal);
        expect(refused).toMatchObject({
            status,
            error: { error: { code, retryable } },
        });
        expect(calls).toHaveLength(1);
    });

    it("a non-2xx with no error.v1 body is a dropped call, not a refusal", async () => {
        const { read } = harness([new Response("<html>gateway</html>", { status: 502 })]);
        const dropped = await read().catch((caught: unknown) => caught);
        expect(dropped).toBeInstanceOf(Error);
        expect(dropped).not.toBeInstanceOf(TransportRefusal);
        expect(dropped).not.toBeInstanceOf(TransportFailure);
    });

    it("no token: authorization_required, and nothing is sent", async () => {
        const { read, calls } = harness([], [{ kind: "none" } as unknown as AcrAccessToken]);
        await expect(read()).rejects.toMatchObject({ reason: "authorization_required" });
        expect(calls).toEqual([]);
    });

    it("an aborted read sends nothing", async () => {
        const { read, calls } = harness([json(EXAMPLE)]);
        const controller = new AbortController();
        controller.abort(new Error("closed"));
        await expect(read(controller.signal)).rejects.toThrow("closed");
        expect(calls).toEqual([]);
    });

    it("401 with a new token sends once more, with that token, and reports the refused one", async () => {
        const { access } = harness([]);
        const { read, calls, rejected } = harness(
            [new Response(null, { status: 401 }), json(EXAMPLE)],
            [access(TOKEN), access(NEXT_TOKEN)],
        );
        await expect(read()).resolves.toMatchObject({ refId: "ev_01J0ACR001" });
        expect(calls).toHaveLength(2);
        expect(calls[1]!.init.headers).toMatchObject({ Authorization: `Bearer ${NEXT_TOKEN}` });
        expect(rejected).toEqual([TOKEN]);
    });

    it("401 twice is authorization_required, with two requests and both tokens reported", async () => {
        const { access } = harness([]);
        const { read, calls, rejected } = harness(
            [new Response(null, { status: 401 }), new Response(null, { status: 401 })],
            [access(TOKEN), access(NEXT_TOKEN)],
        );
        await expect(read()).rejects.toMatchObject({ reason: "authorization_required" });
        expect(calls).toHaveLength(2);
        expect(rejected).toEqual([TOKEN, NEXT_TOKEN]);
    });

    it("logs carry no token, no ref and no result id", async () => {
        const { read } = harness([json(error("access_denied", 403, false), 403)]);
        await read().catch(() => undefined);
        const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);
        expect(logged).toContain("evidence_read");
        expect(logged).not.toContain(TOKEN);
        expect(logged).not.toContain("result_a");
        expect(logged).not.toContain("identity");
    });
});
