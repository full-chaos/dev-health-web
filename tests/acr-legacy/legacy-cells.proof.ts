// CHAOS-13330 (7.12 s3a): executed LEGACY cells of the web ACR paths (ACR_SCOPES_FROM_GRANTS off). For each caller
// (viewer, member, admin, owner, and a platform admin with no membership row) they record what the REAL web route
// answers and the repository scopes it signs into the ACR assertion:
//   - context:read  POST /api/agent-context/context-packets   (service.ts createContextPacket)
//   - evidence:read GET  /api/agent-context/evidence/[id]     (service.ts getExpandedEvidence)
//   - credential:issue, device approval  POST /api/acr/device     {action: approve, repository_scopes: ["*"]}
//   - credential:issue, consent approve  POST /api/acr/authorize  {action: approve, repository_scopes: ["*"]}
// The Ops backend is real (go-api, query-api, auth-service, Postgres, ClickHouse of one dev-health-ops sha); the
// session is the access token a real login returned. ACR is a capture-only double: it records the assertion it
// receives and decides nothing (it answers every call with a fixed success shape).
//
// Armed by ci/acr-legacy/run-legacy-cells.sh, which brings the stack up, seeds it, logs every caller in and sets
// ACR_LEGACY_FIXTURE (the callers and their tokens), ACR_LEGACY_BACKEND_URL and ACR_LEGACY_RECORD. Without them the
// suite fails: a cell that runs nothing must never pass.
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

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(async () => ({ limited: false, retryAfter: 0 })),
}));
vi.mock("@/lib/client-ip", () => ({ getClientIpFromEnv: () => "127.0.0.1" }));

import { auth } from "@/lib/auth";
import { POST as contextPacketRoute } from "@/app/api/agent-context/context-packets/route";
import { GET as evidenceRoute } from "@/app/api/agent-context/evidence/[evidenceRefId]/route";
import { POST as deviceRoute } from "@/app/api/acr/device/route";
import { POST as consentRoute } from "@/app/api/acr/authorize/route";

type Caller = {
    readonly name: string;
    readonly userId: string;
    /** The session org the web session carries; null for a session with no org. */
    readonly sessionOrgId: string | null;
    readonly isSuperuser: boolean;
    readonly accessToken: string;
};
type Fixture = {
    readonly opsSha: string;
    readonly catalogVersion: number;
    readonly orgId: string;
    /** The repositories seeded for the org (ClickHouse repos), sorted. */
    readonly inventory: readonly string[];
    readonly callers: readonly Caller[];
};

const fixturePath = process.env.ACR_LEGACY_FIXTURE ?? "";
const backend = process.env.ACR_LEGACY_BACKEND_URL ?? "";
const recordPath = process.env.ACR_LEGACY_RECORD ?? "";

const ACR = "https://acr.legacy-cells.test";
const WEB_ORIGIN = "https://web.legacy-cells.test";
const HANDLE = "H".repeat(43);
const REPOSITORY = "acme/alpha";
const EVIDENCE_REF = "evref-legacy-cell-0001";

const ORG_ROLES = ["viewer", "member", "admin", "owner"] as const;
/**
 * The platform admin (users.is_superuser) with NO membership row in the org and session org = the org: a member login,
 * then the membership row is deleted (stale session = session org X, no row; acp D6857).
 */
const NO_ROW_PLATFORM_ADMIN = "platform_admin_no_row";
/** A platform admin whose session has no org at all (the login of a user with no membership). */
const NO_ORG_PLATFORM_ADMIN = "platform_admin_no_org";

/**
 * The legacy answer for the no-row platform admin, as recorded by executed run legacy-cells-2 (dev-health-ops
 * c60f0702, catalog 16; record sha256 f8aff1566d30...).
 *
 * context:read and evidence:read are REFUSED before any ACR call. For a superuser web skips the entitlement read
 * (ops.ts resolveOpsAuthorization, platformValidation) and reads the catalog: POST /graphql to query-api. query-api's
 * edge refuses it 401 by design (dev-health-ops internal/queryapi/server/internal_auth.go roleInOrg: "The token's own
 * org always needs the membership, superuser or not"; logged reason=edge_not_a_member). Web maps every non-200 catalog
 * answer to 503 unavailable, retryable (ops.ts readRepositoryScopes, `scopes.status !== 200`), so no scope is signed.
 *
 * Device approval and consent pass web: the go-api impersonation status and licensing reads answer 200 for this
 * caller, so the org-wide ["*"] is sent, as for every org role.
 */
const UNAVAILABLE = {
    error: {
        code: "unavailable",
        message: "Agent Context Runtime is temporarily unavailable.",
        retryable: true,
    },
};
const PLATFORM_ADMIN_NO_ROW = {
    context: { status: 503, body: UNAVAILABLE, assertions: [] },
    evidence: { status: 503, body: UNAVAILABLE, assertions: [] },
    device: { status: 200, body: { status: "approved" }, scopes: ["*"] },
    consent: {
        status: 200,
        body: { redirect_url: "http://localhost:53141/cb?code=c0de&state=s7a7e" },
        scopes: ["*"],
    },
};

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
    client_name: "Legacy Cell MCP",
    client_self_asserted: false,
    expires_at: "2026-11-08T23:00:00Z",
    redirect_origin: "http://localhost:53141",
    resource: "https://mcp.legacy-cells.test/mcp",
    scopes: ["context:read", "evidence:read"],
};

function capture(request: Request): void {
    const assertion = request.headers.get("x-acr-web-assertion");
    if (!assertion)
        throw new Error(`ACR double: no web assertion on ${new URL(request.url).pathname}`);
    const [header, payload, signature] = assertion.split(".");
    if (!header || !payload || !signature) throw new Error("ACR double: malformed assertion");
    const signed = verify(
        null,
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature, "base64url"),
    );
    if (!signed) throw new Error("ACR double: the assertion signature does not verify");
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
    if (!fixturePath || !backend || !recordPath) {
        throw new Error(
            "ACR_LEGACY_FIXTURE, ACR_LEGACY_BACKEND_URL and ACR_LEGACY_RECORD must be set (ci/acr-legacy/run-legacy-cells.sh)",
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
            is_impersonating: false,
            is_superuser: caller.isSuperuser,
        },
    } as never);
}

type Answer = {
    readonly status: number;
    readonly body: unknown;
    /** The repository_scopes of each ACR assertion this call sent, in order (path and permissions with it). */
    readonly assertions: readonly Captured[];
};

async function answerOf(response: Response, from: number): Promise<Answer> {
    const text = await response.text();
    let body: unknown = text;
    try {
        body = JSON.parse(text);
    } catch {
        // kept as text
    }
    return { status: response.status, body, assertions: captured.slice(from) };
}

function post(path: string, body: unknown): Request {
    return new Request(`${WEB_ORIGIN}${path}`, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", origin: WEB_ORIGIN },
        method: "POST",
    });
}

async function contextRead(): Promise<Answer> {
    const from = captured.length;
    return answerOf(
        await contextPacketRoute(
            post("/api/agent-context/context-packets", {
                goal: "legacy cell",
                repository: REPOSITORY,
            }),
        ),
        from,
    );
}

async function evidenceRead(): Promise<Answer> {
    const from = captured.length;
    const url = `${WEB_ORIGIN}/api/agent-context/evidence/${EVIDENCE_REF}?repository=${encodeURIComponent(REPOSITORY)}`;
    return answerOf(
        await evidenceRoute(new Request(url), {
            params: Promise.resolve({ evidenceRefId: EVIDENCE_REF }),
        }),
        from,
    );
}

async function deviceApprove(): Promise<Answer> {
    const from = captured.length;
    return answerOf(
        await deviceRoute(
            post("/api/acr/device", {
                action: "approve",
                repository_scopes: ["*"],
                user_code: "ABCD2345",
            }),
        ),
        from,
    );
}

async function consentApprove(): Promise<Answer> {
    const from = captured.length;
    return answerOf(
        await consentRoute(
            post("/api/acr/authorize", {
                action: "approve",
                handle: HANDLE,
                repository_scopes: ["*"],
            }),
        ),
        from,
    );
}

function record(caller: string, cell: string, answer: Answer): void {
    appendFileSync(
        recordPath,
        `${JSON.stringify({ caller, cell, opsSha: fixture.opsSha, catalogVersion: fixture.catalogVersion, ...answer })}\n`,
    );
}

/** The scopes of the assertions with this permission set, or null when the call sent none. */
function scopesOf(answer: Answer, path: string): unknown {
    return answer.assertions.find((a) => a.path === path)?.repositoryScopes ?? null;
}

const CONTEXT_PATH = "/api/v1/agent-context/context-packets";
const EVIDENCE_PATH = `/api/v1/agent-context/evidence/${EVIDENCE_REF}`;
const DEVICE_PATH = "/api/v1/oauth/device_approval";
const CONSENT_PATH = "/authorize/consent";

beforeAll(() => {
    acr.listen({ onUnhandledRequest: "bypass" });
    keyDirectory = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "acr-legacy-cells-"));
    const pair = generateKeyPairSync("ed25519");
    publicKey = pair.publicKey;
    const keyFile = join(keyDirectory, "web-assertion.key");
    writeFileSync(keyFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
    chmodSync(keyFile, 0o600);
    vi.stubEnv("ACR_SCOPES_FROM_GRANTS", "");
    vi.stubEnv("ACR_API_ORIGIN", ACR);
    vi.stubEnv("ACR_OAUTH_ISSUER", "https://acr-public.legacy-cells.test");
    vi.stubEnv("ACR_REQUEST_TIMEOUT_MS", "10000");
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", keyFile);
    vi.stubEnv("ACR_WEB_ASSERTION_KID", "web-key-legacy-cells");
    vi.stubEnv("AUTH_URL", WEB_ORIGIN);
    vi.stubEnv("BACKEND_URL", backend);
});
afterAll(() => {
    acr.close();
    vi.unstubAllEnvs();
    if (keyDirectory) rmSync(keyDirectory, { force: true, recursive: true });
});
beforeEach(() => vi.mocked(auth).mockReset());

describe(`ACR legacy cells (switch off) on dev-health-ops ${fixture.opsSha} catalog ${fixture.catalogVersion}`, () => {
    // Every org role: the context and evidence assertions carry the org's catalog list; device approval and consent
    // pass web and send the org-wide ["*"] (service.ts issuanceContext: any org session, refused only while
    // impersonating).
    describe.each(ORG_ROLES)("%s of the org", (role) => {
        it("context:read signs the catalog list", async () => {
            signIn(callerNamed(role));
            const answer = await contextRead();
            record(role, "context:read", answer);
            expect(scopesOf(answer, CONTEXT_PATH)).toEqual(fixture.inventory);
        });
        it("evidence:read signs the catalog list", async () => {
            signIn(callerNamed(role));
            const answer = await evidenceRead();
            record(role, "evidence:read", answer);
            expect(scopesOf(answer, EVIDENCE_PATH)).toEqual(fixture.inventory);
        });
        it("device approval is approved with the org-wide scope", async () => {
            signIn(callerNamed(role));
            const answer = await deviceApprove();
            record(role, "credential:issue device", answer);
            expect(answer.status).toBe(200);
            expect(answer.body).toEqual({ status: "approved" });
            expect(scopesOf(answer, DEVICE_PATH)).toEqual(["*"]);
        });
        it("consent approve is approved with the org-wide scope", async () => {
            signIn(callerNamed(role));
            const answer = await consentApprove();
            record(role, "credential:issue consent", answer);
            expect(answer.status).toBe(200);
            expect(answer.body).toEqual({
                redirect_url: "http://localhost:53141/cb?code=c0de&state=s7a7e",
            });
            expect(
                answer.assertions
                    .filter((a) => a.path === CONSENT_PATH)
                    .map((a) => a.repositoryScopes),
            ).toEqual([["*"], ["*"]]);
        });
    });

    // Product rule 1: the platform admin with no membership row gets the legacy answer. These cells PIN that answer
    // (PLATFORM_ADMIN_NO_ROW above); the PDP path must equal it (CHAOS-13325 equality cells). The caller is built as a
    // stale session (acp D6857): a member login, then the membership row is deleted. Login never gives a session org
    // to a user with no membership row, so this is the one way a session carries org X with no row in X.
    describe("platform admin: member login, then the membership row is deleted (stale session = session org X, no row)", () => {
        it("context:read is refused 503 unavailable with no ACR call (query-api edge: not a member of the token org)", async () => {
            signIn(callerNamed(NO_ROW_PLATFORM_ADMIN));
            const answer = await contextRead();
            record(NO_ROW_PLATFORM_ADMIN, "context:read", answer);
            expect({
                status: answer.status,
                body: answer.body,
                assertions: answer.assertions,
            }).toEqual(PLATFORM_ADMIN_NO_ROW.context);
        });
        it("evidence:read is refused 503 unavailable with no ACR call (query-api edge: not a member of the token org)", async () => {
            signIn(callerNamed(NO_ROW_PLATFORM_ADMIN));
            const answer = await evidenceRead();
            record(NO_ROW_PLATFORM_ADMIN, "evidence:read", answer);
            expect({
                status: answer.status,
                body: answer.body,
                assertions: answer.assertions,
            }).toEqual(PLATFORM_ADMIN_NO_ROW.evidence);
        });
        it("device approval", async () => {
            signIn(callerNamed(NO_ROW_PLATFORM_ADMIN));
            const answer = await deviceApprove();
            record(NO_ROW_PLATFORM_ADMIN, "credential:issue device", answer);
            expect({
                status: answer.status,
                body: answer.body,
                scopes: scopesOf(answer, DEVICE_PATH),
            }).toEqual(PLATFORM_ADMIN_NO_ROW.device);
        });
        it("consent approve", async () => {
            signIn(callerNamed(NO_ROW_PLATFORM_ADMIN));
            const answer = await consentApprove();
            record(NO_ROW_PLATFORM_ADMIN, "credential:issue consent", answer);
            expect({
                status: answer.status,
                body: answer.body,
                scopes: scopesOf(answer, CONSENT_PATH),
            }).toEqual(PLATFORM_ADMIN_NO_ROW.consent);
        });
    });

    // A platform admin's login with no membership gives a session with no org: web refuses every ACR route before any
    // backend or ACR call (service.ts sessionOrError: 401). In the browser, src/proxy.ts sends such a session to
    // /superadmin before the route runs.
    describe("platform admin whose session has no org", () => {
        const unauthenticated = {
            error: { code: "unauthenticated", message: expect.any(String), retryable: false },
        };
        it.each([
            ["context:read", contextRead],
            ["evidence:read", evidenceRead],
            ["credential:issue device", deviceApprove],
            ["credential:issue consent", consentApprove],
        ] as const)("%s is refused 401 with no ACR call", async (cell, call) => {
            signIn(callerNamed(NO_ORG_PLATFORM_ADMIN));
            const answer = await call();
            record(NO_ORG_PLATFORM_ADMIN, cell, answer);
            expect(answer.status).toBe(401);
            expect(answer.body).toEqual(unauthenticated);
            expect(answer.assertions).toEqual([]);
        });
    });
});
