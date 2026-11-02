import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import * as streamEnvelopeValidators from "@/lib/acr/streamEnvelopeValidators";
import * as streamValidators from "@/lib/acr/streamValidators";
import type { AcrAccessToken } from "@/lib/ask-dev/acr-auth";
import type { AcrBrowserClientConfig } from "@/lib/ask-dev/acr-browser-config";
import {
    TransportRefusal,
    type AskDevTransport,
} from "@/components/ask-dev/conversation/transport";

import { createAcrBrowserTransport } from "../browserTransport";

/**
 * CHAOS-12439: the second acceptance. Every status ACR's OpenAPI lists for an operation that
 * `browserTransport.ts` calls has a case in the table below, which says how the transport treats
 * it. A new status in a pin bump fails here until someone writes its case. The transport has no
 * branch per status: the table states what its generic rules do, and the 409 test proves the one
 * claim train 4 needs (the nine JSON calls carry ACR's `error.v1` as a `TransportRefusal`).
 */

const OPENAPI = JSON.parse(
    readFileSync(join(process.cwd(), "src/lib/acr/contracts/openapi/acr-v1.json"), "utf8"),
) as {
    paths: Record<string, Record<string, { operationId?: string; responses?: object }>>;
};
// The calls are ask-dev's and web's own reads are here: a row is held against both files.
const TRANSPORT_SOURCE = [
    join(__dirname, "../browserTransport.ts"),
    join(process.cwd(), "node_modules/@full-chaos/ask-dev/src/acr-client/transport.ts"),
]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

const OK = "success: the body is parsed and returned";
const AUTH =
    "401: one resend with a different token, else TransportFailure(authorization_required)";
const REFUSAL =
    "TransportRefusal(status, the error.v1 body); a body that is not error.v1 is an Error";
const STREAM_REFUSAL = "opens no stream: TransportRefusal(status, the error.v1 body)";
const NULL_404 = "null: ACR's one not-found answer";
const REFUSAL_404 = "TransportRefusal(404), synthetic when the body is missing";

type Treatments = Readonly<Record<string, string>>;
type Entry = {
    readonly method: string;
    readonly path: string;
    /** A path fragment that `browserTransport.ts` must contain: the operation is really called. */
    readonly source: string;
    readonly statuses: Treatments;
};

/** Keyed by OpenAPI `operationId`. 409 is listed for every operation, listed by ACR yet or not. */
const TABLE: Readonly<Record<string, Entry>> = {
    createContextFabricInvestigation: {
        method: "post",
        path: "/api/v1/context-fabric/investigations",
        source: 'path: "/investigations"',
        statuses: {
            "200": "event stream",
            "400": STREAM_REFUSAL,
            "401": AUTH,
            "403": STREAM_REFUSAL,
            "404": STREAM_REFUSAL,
            "406": STREAM_REFUSAL,
            "409": `${STREAM_REFUSAL}; the store maps the codes it knows (no_repository: not_run)`,
            "413": STREAM_REFUSAL,
            "422": STREAM_REFUSAL,
            "426": STREAM_REFUSAL,
            "429": STREAM_REFUSAL,
            "500": STREAM_REFUSAL,
            "502": STREAM_REFUSAL,
            "503": STREAM_REFUSAL,
            "504": STREAM_REFUSAL,
        },
    },
    getContextFabricInvestigation: {
        method: "get",
        path: "/api/v1/context-fabric/investigations/{result_id}",
        source: "/investigations/${encodeURIComponent(resultId)}`",
        statuses: {
            "200": OK,
            "400": REFUSAL,
            "401": AUTH,
            "403": REFUSAL,
            "404": REFUSAL_404,
            "409": REFUSAL,
            "413": REFUSAL,
            "426": REFUSAL,
            "429": REFUSAL,
            "500": REFUSAL,
            "503": REFUSAL,
            "504": REFUSAL,
        },
    },
    getContextFabricSubmissionStatus: {
        method: "get",
        path: "/api/v1/context-fabric/investigations/submissions/{submission_id}",
        source: "const path = `/investigations/submissions/${encodeURIComponent(submissionId)}`;",
        statuses: {
            "200": OK,
            "401": AUTH,
            "403": REFUSAL,
            "404": NULL_404,
            "409": REFUSAL,
            "426": REFUSAL,
            "429": REFUSAL,
            "500": REFUSAL,
            "503": REFUSAL,
            "504": REFUSAL,
        },
    },
    attachContextFabricSubmissionEvents: {
        method: "get",
        path: "/api/v1/context-fabric/investigations/submissions/{submission_id}/events",
        source: "/events`,",
        statuses: {
            "200": "event stream, resumed after the cursor",
            "400": STREAM_REFUSAL,
            "401": AUTH,
            "403": STREAM_REFUSAL,
            "404": STREAM_REFUSAL,
            "409": STREAM_REFUSAL,
            "410": STREAM_REFUSAL,
            "426": STREAM_REFUSAL,
            "429": STREAM_REFUSAL,
            "500": STREAM_REFUSAL,
            "503": STREAM_REFUSAL,
            "504": STREAM_REFUSAL,
        },
    },
    cancelContextFabricSubmissionRun: {
        method: "post",
        path: "/api/v1/context-fabric/investigations/submissions/{submission_id}/cancel",
        source: "/cancel`;",
        statuses: {
            "202": "{ kind: running }",
            "204": "{ kind: final }",
            "401": AUTH,
            "403": REFUSAL,
            "404": REFUSAL_404,
            "409":
                "{ kind: not_leased } for submission_in_progress with details.reason not_leased, else " +
                REFUSAL,
            "426": REFUSAL,
            "429": REFUSAL,
            "500": REFUSAL,
            "503": REFUSAL,
            "504": REFUSAL,
        },
    },
    getContextFabricResultFeedback: {
        method: "get",
        path: "/api/v1/context-fabric/investigations/feedback/{result_id}",
        source: 'const { response, body } = await callJson(path, "feedback_read", signal);',
        statuses: {
            "200": OK,
            "401": AUTH,
            "403": REFUSAL,
            "404": NULL_404,
            "409": REFUSAL,
            "426": REFUSAL,
            "429": REFUSAL,
            "500": REFUSAL,
            "503": REFUSAL,
            "504": REFUSAL,
        },
    },
    setContextFabricResultFeedback: {
        method: "post",
        path: "/api/v1/context-fabric/investigations/feedback/{result_id}",
        source: '"feedback_set",',
        statuses: {
            "200": OK,
            "400": REFUSAL,
            "401": AUTH,
            "403": REFUSAL,
            "404": REFUSAL_404,
            "409": REFUSAL,
            "426": REFUSAL,
            "429": REFUSAL,
            "500": REFUSAL,
            "503": REFUSAL,
            "504": REFUSAL,
        },
    },
    listContextFabricThreads: {
        method: "get",
        path: "/api/v1/context-fabric/threads",
        source: "const path = `/threads${query({ limit: String(limit), cursor })}`;",
        statuses: {
            "200": OK,
            "400": REFUSAL,
            "401": AUTH,
            "403": REFUSAL,
            "409": REFUSAL,
            "426": REFUSAL,
            "429": REFUSAL,
            "500": REFUSAL,
            "503": REFUSAL,
            "504": REFUSAL,
        },
    },
    getContextFabricThread: {
        method: "get",
        path: "/api/v1/context-fabric/threads/{thread_id}",
        source: "const path = `/threads/${encodeURIComponent(threadId)}${query({ before })}`;",
        statuses: {
            "200": OK,
            "400": REFUSAL,
            "401": AUTH,
            "403": REFUSAL,
            "404": NULL_404,
            "409": REFUSAL,
            "426": REFUSAL,
            "429": REFUSAL,
            "500": REFUSAL,
            "503": REFUSAL,
            "504": REFUSAL,
        },
    },
    deleteContextFabricThread: {
        method: "delete",
        path: "/api/v1/context-fabric/threads/{thread_id}",
        source: '"thread_delete"',
        statuses: {
            "204": "success: nothing returned",
            "401": AUTH,
            "403": REFUSAL,
            "404": REFUSAL_404,
            "409": REFUSAL,
            "426": REFUSAL,
            "429": REFUSAL,
            "500": REFUSAL,
            "503": REFUSAL,
            "504": REFUSAL,
        },
    },
    getEvidence: {
        method: "get",
        path: "/api/v1/agent-context/evidence/{evidence_ref_id}",
        source: "EVIDENCE_API",
        statuses: {
            "200": OK,
            "401": AUTH,
            "403": REFUSAL,
            "404": NULL_404,
            "409": REFUSAL,
            "413": REFUSAL,
            "426": REFUSAL,
            "429": REFUSAL,
            "500": REFUSAL,
            "503": REFUSAL,
            "504": REFUSAL,
        },
    },
};

describe("the statuses ACR's OpenAPI lists, per operation the transport calls", () => {
    const entries = Object.entries(TABLE);

    it("reads at least the eleven operations the transport calls", () => {
        expect(entries).toHaveLength(11);
        const read = entries.filter(
            ([id, entry]) => OPENAPI.paths[entry.path]?.[entry.method]?.operationId === id,
        );
        expect(read.map(([id]) => id)).toEqual(entries.map(([id]) => id));
    });

    it.each(entries)(
        "%s: every listed status has a case, and every case is listed",
        (id, entry) => {
            const operation = OPENAPI.paths[entry.path]?.[entry.method];
            expect(operation?.operationId).toBe(id);
            expect(TRANSPORT_SOURCE).toContain(entry.source);
            const listed = Object.keys(operation?.responses ?? {});
            expect(listed.length).toBeGreaterThan(0);
            const missing = listed.filter((status) => !Object.hasOwn(entry.statuses, status));
            expect(missing, `no case for ${id} statuses`).toEqual([]);
            // 409 is held for every operation now, so a train that lists it changes no row.
            expect(Object.hasOwn(entry.statuses, "409")).toBe(true);
            for (const treatment of Object.values(entry.statuses)) expect(treatment).not.toBe("");
        },
    );

    it("fails when the OpenAPI lists a status the table lacks (planted)", () => {
        const [, entry] = entries[2]!;
        const pruned = Object.fromEntries(
            Object.entries(entry.statuses).filter(([status]) => status !== "503"),
        );
        const listed = Object.keys(OPENAPI.paths[entry.path]?.[entry.method]?.responses ?? {});
        expect(listed.filter((status) => !Object.hasOwn(pruned, status))).toEqual(["503"]);
    });
});

const ISSUER = "https://acr.example.test";
const CONFIG: AcrBrowserClientConfig = {
    issuer: ISSUER,
    webOrigin: "https://web.example.test",
    clientId: "https://web.example.test/oauth/acr-client.json",
    redirectUri: "https://web.example.test/ask-dev/oauth/callback",
    usesMetadataDocument: true,
};
const TOKEN = "fcacr_test_token_0000000000000000000000000000000";
const ACCESS: AcrAccessToken = { kind: "token", token: TOKEN, issuer: ISSUER };
const signal = new AbortController().signal;

describe("409 no_repository on the nine JSON calls", () => {
    let transport: AskDevTransport;
    let calls: number;

    beforeEach(() => {
        calls = 0;
        const body = {
            schema_version: "error.v1",
            request_id: "req_refused",
            error: {
                code: "no_repository",
                message: "refused",
                http_status: 409,
                retryable: false,
            },
        };
        transport = createAcrBrowserTransport(CONFIG, {
            fetch: (async () => {
                calls += 1;
                return new Response(JSON.stringify(body), {
                    status: 409,
                    headers: { "Content-Type": "application/json" },
                });
            }) as unknown as typeof fetch,
            now: () => 1_800_000_000_000,
            token: () => ACCESS,
            rejected: () => undefined,
            authorize: async () => ({ kind: "off" }),
            envelope: streamEnvelopeValidators,
            validators: async () => streamValidators,
        });
    });

    const jsonCalls: readonly (readonly [string, (t: AskDevTransport) => Promise<unknown>])[] = [
        ["submissionStatus", (t) => t.submissionStatus("sub-12345678", signal)],
        ["readResult", (t) => t.readResult("res-12345678", signal)],
        ["listThreads", (t) => t.listThreads({ limit: 20, signal })],
        ["readThread", (t) => t.readThread({ threadId: "thread-12345678", signal })],
        ["deleteThread", (t) => t.deleteThread({ threadId: "thread-12345678", signal })],
        ["cancel", (t) => t.cancel({ submissionId: "sub-12345678", signal })],
        ["readFeedback", (t) => t.readFeedback({ resultId: "res-12345678", signal })],
        ["readEvidence", (t) => t.readEvidence({ refId: "ev-1", resultId: "res-1", signal })],
        [
            "setFeedback",
            (t) =>
                t.setFeedback({
                    resultId: "res-12345678",
                    correct: "yes",
                    useful: "unset",
                    signal,
                }),
        ],
    ];

    it.each(jsonCalls)(
        "%s: TransportRefusal(409) carrying error.v1 no_repository",
        async (_name, call) => {
            const failure = await call(transport).then(
                () => undefined,
                (error: unknown) => error,
            );
            expect(failure).toBeInstanceOf(TransportRefusal);
            expect((failure as TransportRefusal).status).toBe(409);
            expect((failure as TransportRefusal).error.error.code).toBe("no_repository");
            expect(calls).toBe(1);
        },
    );
});
