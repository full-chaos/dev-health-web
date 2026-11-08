// CHAOS-13325 (7.12 s3b): executed real-PDP equality cells (acp conditions 1 and 2). For each caller the REAL web
// routes run twice on one stack: ACR_SCOPES_FROM_GRANTS off (legacy) and on (decided by the real auth-service PDP over
// the web authorize transport). The answers must be equal, byte for byte: the assertions (path, permissions,
// repository_scopes), and the route status and body where the route answers on its own (device, consent, refusals).
// The read routes' body comes from the ACR double and is not compared.
//
// Stack: dev-health-ops at ONE named sha (s2b delta B: catalog 18), go-api, query-api, auth-service, router, Postgres,
// ClickHouse in a private compose project (ci/acr-legacy/run-pdp-equality.sh). ACR is a capture-only double. The PDP
// answers come from auth-service only: the web workload token is exchanged from a compose bootstrap credential (the
// one difference from prod, where the web workload exchanges its ServiceAccount token); the /v1/authorize calls are
// web's own transport (createAuthorizeTransport), counted per cell.
//
// Armed by the runner (ACR_PDP_FIXTURE, ACR_PDP_BACKEND_URL, ACR_PDP_AUTH_INTERNAL_URL, ACR_PDP_RECORD); unarmed, the
// suite fails.
import {
    appendFileSync,
    chmodSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { generateKeyPairSync, verify } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import type { Transport } from "@/lib/auth/authorize/client";

const pdpCalls = vi.hoisted(() => ({ count: 0 }));
const workload = vi.hoisted(() => ({ token: "" }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(async () => ({ limited: false, retryAfter: 0 })),
}));
vi.mock("@/lib/client-ip", () => ({ getClientIpFromEnv: () => "127.0.0.1" }));
// The web workload token: exchanged once from the compose bootstrap credential (beforeAll).
vi.mock("@/lib/auth/workload/token", () => ({
    getWorkloadToken: async () => workload.token,
    workloadTokenConfigured: () => workload.token !== "",
}));
// web's own transport, counted: a cell that must ask no decision checks the count.
vi.mock("@/lib/acr/authorizeTransport", async () => {
    const { createAuthorizeTransport } = await import("@/lib/auth/authorize/transport");
    return {
        loadAuthorizeTransport: (): Transport => {
            const real = createAuthorizeTransport();
            return async (call) => {
                pdpCalls.count += 1;
                return real(call);
            };
        },
    };
});

import { auth } from "@/lib/auth";
import { authorize } from "@/lib/auth/authorize/client";
import { createAuthorizeTransport } from "@/lib/auth/authorize/transport";
import { POST as contextPacketRoute } from "@/app/api/agent-context/context-packets/route";
import { GET as evidenceRoute } from "@/app/api/agent-context/evidence/[evidenceRefId]/route";
import { POST as deviceRoute } from "@/app/api/acr/device/route";
import { POST as consentRoute } from "@/app/api/acr/authorize/route";

type Caller = {
    readonly name: string;
    readonly userId: string;
    readonly sessionOrgId: string | null;
    readonly isSuperuser: boolean;
    /** The web session's own impersonation state (the Ops status read runs too). */
    readonly impersonating: boolean;
    readonly accessToken: string;
};
type Fixture = {
    readonly opsSha: string;
    readonly catalogVersion: number;
    readonly orgId: string;
    /** Org S: the session org of platform_admin_no_row_suspended, suspended after the logins. */
    readonly suspendedOrgId: string;
    readonly inventory: readonly string[];
    readonly webBootstrapFile: string;
    readonly callers: readonly Caller[];
};

const fixturePath = process.env.ACR_PDP_FIXTURE ?? "";
const backend = process.env.ACR_PDP_BACKEND_URL ?? "";
const authInternal = process.env.ACR_PDP_AUTH_INTERNAL_URL ?? "";
const recordPath = process.env.ACR_PDP_RECORD ?? "";

const ACR = "https://acr.pdp-equality.test";
const WEB_ORIGIN = "https://web.pdp-equality.test";
const HANDLE = "H".repeat(43);
const REPOSITORY = "acme/alpha";
const EVIDENCE_REF = "evref-pdp-cell-0001";
const ORG_ROLES = ["viewer", "member", "admin", "owner"] as const;

/**
 * KnownDivergence row (acp D6857-2): an exact-grant holder gets the named allowed list where legacy sends the
 * organization-wide scope. Stricter than legacy, never wider. Prod holds no grant row of either kind: RECORD
 * /var/lib/oci-cache/lane-scratch/fcsup/s97/r10885/RECORD-grants-kind-1.md (sha256 6899fc1bd886...): auth.resource_grants
 * wildcard 0, exact 0, 0 of 3 orgs, read 2026-11-08 16:10Z. No chris ask (pm, D6857-2).
 */
const EXACT_GRANT_DIVERGENCE =
    "KnownDivergence exact-grant: named allowed list instead of the legacy org-wide scope (stricter); prod grants 0 (RECORD s97/r10885/RECORD-grants-kind-1.md 6899fc1bd886, 16:10Z)";

type Captured = { path: string; permissions: unknown; repositoryScopes: unknown };
const captured: Captured[] = [];
let publicKey = generateKeyPairSync("ed25519").publicKey;
let keyDirectory = "";

const CAPABILITIES = {
    enabled_tools: ["context_for_task", "source_evidence"],
    entitlements: { agent_context_runtime: true },
    generated_at: "2026-11-08T00:00:00Z",
    limits: {
        max_items: 50,
        max_output_tokens: 16_000,
        max_serialized_bytes: 1_048_576,
        requests_per_minute: 120,
    },
    minimum_sidecar_version: "1.0.0",
    permissions: { context_read: true, episode_write: false, evidence_read: true },
    schema_version: "capabilities.v1",
    service: "dev-health-acr",
    service_version: "1.0.0",
    supported_schema_versions: [
        "context_packet.v1",
        "context_packet_request.v1",
        "expanded_evidence.v1",
    ],
};
const MCP_PREVIEW = {
    client_kind: "metadata_document",
    client_name: "PDP Cell MCP",
    client_self_asserted: false,
    expires_at: "2026-11-08T23:00:00Z",
    redirect_origin: "http://localhost:53141",
    resource: "https://mcp.pdp-equality.test/mcp",
    scopes: ["context:read", "evidence:read"],
};

function capture(request: Request): void {
    const assertion = request.headers.get("x-acr-web-assertion");
    if (!assertion)
        throw new Error(`ACR double: no web assertion on ${new URL(request.url).pathname}`);
    const [header, payload, signature] = assertion.split(".");
    if (!header || !payload || !signature) throw new Error("ACR double: malformed assertion");
    if (
        !verify(
            null,
            Buffer.from(`${header}.${payload}`),
            publicKey,
            Buffer.from(signature, "base64url"),
        )
    ) {
        throw new Error("ACR double: the assertion signature does not verify");
    }
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
        string,
        unknown
    >;
    captured.push({
        path: new URL(request.url).pathname,
        permissions: claims["permissions"],
        repositoryScopes: claims["repository_scopes"],
    });
}

// Capture only: every answer is fixed; nothing here reads the assertion to decide.
const acr = setupServer(
    http.get(`${ACR}/api/v1/agent-context/capabilities`, ({ request }) => {
        capture(request);
        return HttpResponse.json(CAPABILITIES);
    }),
    http.post(`${ACR}/api/v1/agent-context/context-packets`, ({ request }) => {
        capture(request);
        return HttpResponse.json({ schema_version: "context_packet.v1" });
    }),
    http.get(`${ACR}/api/v1/agent-context/evidence/:id`, ({ request }) => {
        capture(request);
        return HttpResponse.json({ schema_version: "expanded_evidence.v1" });
    }),
    http.post(`${ACR}/api/v1/oauth/device_approval`, async ({ request }) => {
        capture(request);
        const body = (await request.json()) as { schema_version?: string };
        return body.schema_version === "device_approval_request.v1"
            ? HttpResponse.json({
                  schema_version: "device_approval_response.v1",
                  status: "approved",
              })
            : HttpResponse.json({ schema_version: "device_approval_preview_response.v1" });
    }),
    http.post(`${ACR}/authorize/consent`, async ({ request }) => {
        capture(request);
        const body = (await request.json()) as { action?: string };
        if (body.action === "preview") return HttpResponse.json(MCP_PREVIEW);
        return HttpResponse.json({
            redirect_url: "http://localhost:53141/cb?code=c0de&state=s7a7e",
        });
    }),
);

function loadFixture(): Fixture {
    if (!fixturePath || !backend || !authInternal || !recordPath) {
        throw new Error(
            "ACR_PDP_FIXTURE, ACR_PDP_BACKEND_URL, ACR_PDP_AUTH_INTERNAL_URL and ACR_PDP_RECORD must be set (ci/acr-legacy/run-pdp-equality.sh)",
        );
    }
    return JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;
}
const fixture = loadFixture();

function callerNamed(name: string): Caller {
    const caller = fixture.callers.find((c) => c.name === name);
    if (!caller) throw new Error(`the fixture has no caller ${name}`);
    return caller;
}

function signIn(caller: Caller): void {
    vi.mocked(auth).mockResolvedValue({
        access_token: caller.accessToken,
        expires: "2026-11-09T00:00:00.000Z",
        user: {
            id: caller.userId,
            ...(caller.sessionOrgId === null
                ? {}
                : { org_id: caller.sessionOrgId, real_org_id: caller.sessionOrgId }),
            is_impersonating: caller.impersonating,
            is_superuser: caller.isSuperuser,
        },
    } as never);
}

type Answer = {
    readonly status: number;
    readonly body: unknown;
    readonly assertions: readonly Captured[];
    /** /v1/authorize calls this cell made. */
    readonly decisions: number;
};

function post(path: string, body: unknown): Request {
    return new Request(`${WEB_ORIGIN}${path}`, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", origin: WEB_ORIGIN },
        method: "POST",
    });
}

const CELLS = {
    "context:read": () =>
        contextPacketRoute(
            post("/api/agent-context/context-packets", {
                goal: "pdp cell",
                repository: REPOSITORY,
            }),
        ),
    "evidence:read": () =>
        evidenceRoute(
            new Request(
                `${WEB_ORIGIN}/api/agent-context/evidence/${EVIDENCE_REF}?repository=${encodeURIComponent(REPOSITORY)}`,
            ),
            { params: Promise.resolve({ evidenceRefId: EVIDENCE_REF }) },
        ),
    "credential:issue device": () =>
        deviceRoute(
            post("/api/acr/device", {
                action: "approve",
                repository_scopes: ["*"],
                user_code: "ABCD2345",
            }),
        ),
    "credential:issue consent": () =>
        consentRoute(
            post("/api/acr/authorize", {
                action: "approve",
                handle: HANDLE,
                repository_scopes: ["*"],
            }),
        ),
} as const;
type Cell = keyof typeof CELLS;
const READS: readonly Cell[] = ["context:read", "evidence:read"];

async function run(cell: Cell, grants: boolean): Promise<Answer> {
    vi.stubEnv("ACR_SCOPES_FROM_GRANTS", grants ? "true" : "");
    const from = captured.length;
    const decisionsBefore = pdpCalls.count;
    const response = await CELLS[cell]();
    const text = await response.text();
    let body: unknown = text;
    try {
        body = JSON.parse(text);
    } catch {
        // kept as text
    }
    return {
        status: response.status,
        body,
        assertions: captured.slice(from),
        decisions: pdpCalls.count - decisionsBefore,
    };
}

/** Both paths, recorded. */
async function both(callerName: string, cell: Cell): Promise<{ legacy: Answer; grants: Answer }> {
    signIn(callerNamed(callerName));
    const legacy = await run(cell, false);
    const grants = await run(cell, true);
    appendFileSync(
        recordPath,
        `${JSON.stringify({ caller: callerName, cell, opsSha: fixture.opsSha, catalogVersion: fixture.catalogVersion, legacy, grants })}\n`,
    );
    return { legacy, grants };
}

/** What equality compares: the assertions always; status and body where the route answers on its own. */
function compared(cell: Cell, answer: Answer): unknown {
    const ownAnswer = !READS.includes(cell) || answer.assertions.length === 0;
    return ownAnswer
        ? { status: answer.status, body: answer.body, assertions: answer.assertions }
        : { status: answer.status, assertions: answer.assertions };
}

async function expectEqual(
    callerName: string,
    cell: Cell,
): Promise<{ legacy: Answer; grants: Answer }> {
    const result = await both(callerName, cell);
    expect(result.legacy.decisions, "the legacy path asks no decision").toBe(0);
    expect(compared(cell, result.grants)).toEqual(compared(cell, result.legacy));
    return result;
}

beforeAll(async () => {
    acr.listen({ onUnhandledRequest: "bypass" });
    keyDirectory = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "acr-pdp-equality-"));
    const pair = generateKeyPairSync("ed25519");
    publicKey = pair.publicKey;
    const keyFile = join(keyDirectory, "web-assertion.key");
    writeFileSync(keyFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
    chmodSync(keyFile, 0o600);
    vi.stubEnv("ACR_API_ORIGIN", ACR);
    vi.stubEnv("ACR_OAUTH_ISSUER", "https://acr-public.pdp-equality.test");
    vi.stubEnv("ACR_REQUEST_TIMEOUT_MS", "10000");
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", keyFile);
    vi.stubEnv("ACR_WEB_ASSERTION_KID", "web-key-pdp-cells");
    vi.stubEnv("AUTH_URL", WEB_ORIGIN);
    vi.stubEnv("BACKEND_URL", backend);
    vi.stubEnv("AUTH_INTERNAL_URL", authInternal);
    // The web workload token from its compose bootstrap credential (auth-service token exchange).
    const exchange = await fetch(
        `${authInternal.replace(/\/+$/u, "")}/internal/v1/token/exchange`,
        {
            body: new URLSearchParams({
                audience: "auth-service",
                grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
                subject_token: readFileSync(fixture.webBootstrapFile, "utf8").trim(),
                subject_token_type: "urn:dev-health:params:oauth:token-type:workload-bootstrap",
            }),
            headers: { "content-type": "application/x-www-form-urlencoded" },
            method: "POST",
        },
    );
    if (exchange.status !== 200)
        throw new Error(`web workload token exchange answered ${exchange.status}`);
    workload.token = ((await exchange.json()) as { access_token: string }).access_token;
});
afterAll(() => {
    acr.close();
    vi.unstubAllEnvs();
    if (keyDirectory) rmSync(keyDirectory, { force: true, recursive: true });
});
beforeEach(() => vi.mocked(auth).mockReset());

describe(`ACR real-PDP equality on dev-health-ops ${fixture.opsSha} catalog ${fixture.catalogVersion}`, () => {
    // Condition (a): every org role's acr.context.read allow on the membership default is org-wide.
    describe("condition (a): the role allows carry repository_scope organization", () => {
        it.each(ORG_ROLES)(
            "%s: acr.context.read on the membership default is org-wide",
            async (role) => {
                const outcome = await authorize(
                    {
                        action: "acr.context.read",
                        principalReference: callerNamed(role).accessToken,
                        requestId: `req_${"c".repeat(20)}${role.padEnd(6, "x").slice(0, 6)}`,
                        resource: {
                            key: REPOSITORY,
                            organizationId: fixture.orgId,
                            type: "repository",
                        },
                    },
                    { timeoutMs: 10_000, transport: createAuthorizeTransport() },
                );
                appendFileSync(
                    recordPath,
                    `${JSON.stringify({ caller: role, cell: "condition (a)", outcome })}\n`,
                );
                expect(outcome.allowed).toBe(true);
                if (!outcome.allowed) return;
                expect(outcome.decision.obligations?.repositoryScope).toBe("organization");
                expect(outcome.decision.obligations?.repositoryAllowlist).toBeUndefined();
            },
        );
    });

    describe.each([...ORG_ROLES, "wildcard_grant"])("%s: switch on equals legacy", (callerName) => {
        it.each(Object.keys(CELLS) as Cell[])("%s", async (cell) => {
            const { grants } = await expectEqual(callerName, cell);
            expect(grants.decisions).toBeGreaterThan(0);
        });
    });

    describe("exact_grant: the named list (KnownDivergence, stricter than legacy)", () => {
        it.for(["credential:issue device", "credential:issue consent"] as const)(
            "%s",
            async (cell, ctx) => {
                const { legacy, grants } = await both("exact_grant", cell);
                const legacyScopes = legacy.assertions.map((a) => a.repositoryScopes);
                const grantScopes = grants.assertions.map((a) => a.repositoryScopes);
                // Legacy sends the org-wide scope; grants send only the granted name. Never wider.
                expect(legacyScopes.every((s) => JSON.stringify(s) === '["*"]')).toBe(true);
                expect(grantScopes.length).toBeGreaterThan(0);
                for (const scopes of grantScopes) expect(scopes).toEqual([REPOSITORY]);
                ctx.skip(EXACT_GRANT_DIVERGENCE);
            },
        );
        it.for(READS)("%s", async (cell, ctx) => {
            const { legacy, grants } = await both("exact_grant", cell);
            const legacyScopes = legacy.assertions.map((a) => a.repositoryScopes);
            const grantScopes = grants.assertions.map((a) => a.repositoryScopes);
            for (const scopes of legacyScopes) expect(scopes).toEqual(fixture.inventory);
            expect(grantScopes.length).toBeGreaterThan(0);
            for (const scopes of grantScopes) expect(scopes).toEqual([REPOSITORY]);
            ctx.skip(EXACT_GRANT_DIVERGENCE);
        });
    });

    // Product rule 1 + acp rule 5. The caller: a member login, then the membership row is deleted (stale session =
    // session org X, no row). Reads: both paths refuse 403 not_entitled before any decision (the catalog read is
    // refused by query-api's edge). Device and consent: both 200 ["*"]; on the grants path the acr.credential.issue
    // platform-admin allow carries repository_scope organization ONLY from s2b delta B on: RED on an s2-only build.
    describe("platform_admin_no_row: switch on equals legacy", () => {
        it.each(READS)("%s: both refuse 403 not_entitled with no decision", async (cell) => {
            const { grants } = await expectEqual("platform_admin_no_row", cell);
            expect(grants.status).toBe(403);
            expect(grants.decisions).toBe(0);
        });
        it.each(["credential:issue device", "credential:issue consent"] as const)(
            '%s: both 200 with ["*"] (needs s2b delta B; red on s2 only)',
            async (cell) => {
                const { grants } = await expectEqual("platform_admin_no_row", cell);
                expect(grants.status).toBe(200);
            },
        );
    });

    // acp pre-roll item (ops evaluate.go: a platform admin is also admitted for a SUSPENDED or UNKNOWN org). The caller:
    // a member login in org S, the membership row deleted, then S suspended (public.organizations.is_active = false, as
    // go-api's admin PATCH writes it). No status is pinned: legacy and grants are compared, and a difference FAILS with
    // both byte sets printed (acp decides). The record carries both answers either way.
    describe("platform_admin_no_row_suspended: switch on equals legacy (a difference fails, both printed)", () => {
        it.each(Object.keys(CELLS) as Cell[])("%s", async (cell) => {
            const { legacy, grants } = await both("platform_admin_no_row_suspended", cell);
            const legacyBytes = JSON.stringify(compared(cell, legacy));
            const grantsBytes = JSON.stringify(compared(cell, grants));
            expect(
                legacy.decisions,
                `legacy asked a decision; legacy=${legacyBytes} grants=${grantsBytes}`,
            ).toBe(0);
            expect(
                grantsBytes,
                `LEGACY AND GRANTS DIFFER for ${cell} (suspended org ${fixture.suspendedOrgId}): legacy=${legacyBytes} grants=${grantsBytes}`,
            ).toBe(legacyBytes);
        });
    });

    describe("platform_admin_no_org: both refuse 401 with no decision", () => {
        it.each(Object.keys(CELLS) as Cell[])("%s", async (cell) => {
            const { grants } = await expectEqual("platform_admin_no_org", cell);
            expect(grants.status).toBe(401);
            expect(grants.decisions).toBe(0);
        });
    });

    // Flaw F1: impersonation is refused as legacy, before any decision. The reads allow impersonation in legacy and in
    // the catalog (acr.context.read, acr.evidence.read: impersonation allowed), so they are compared like any read.
    describe("impersonating: switch on equals legacy", () => {
        it.each(["credential:issue device", "credential:issue consent"] as const)(
            "%s: both refuse 403 with no decision",
            async (cell) => {
                const { grants } = await expectEqual("impersonating", cell);
                expect(grants.status).toBe(403);
                expect(grants.decisions).toBe(0);
            },
        );
    });
});
