// CHAOS-13325 (7.12 s3b): device approval, consent and the context/evidence reads decided by the PDP when
// ACR_SCOPES_FROM_GRANTS is on (acp D6857, D6857-2). The PDP is a transport double that answers as ops catalog 18
// (s2b delta B) does: an org-wide allow carries `repository_scope: organization` (membership default with no grant
// rows, a wildcard grant, or the platform admin on acr.credential.issue); an exact grant carries the allowlist.
// The double needs no s2/s2b rows: these cells run green on hosted CI against main's catalog.
import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import type { Transport } from "@/lib/auth/authorize/client";

const seam = vi.hoisted(() => ({ transport: null as Transport | null }));
vi.mock("../authorizeTransport", () => ({ loadAuthorizeTransport: () => seam.transport }));
const logSink = vi.hoisted(() => ({
    lines: [] as { level: string; fields: unknown; msg: unknown }[],
}));
vi.mock("@/lib/logger", () => {
    const at =
        (level: string) =>
        (fields: unknown, msg?: unknown): void => {
            logSink.lines.push({ level, fields, msg });
        };
    const logger = {
        debug: at("debug"),
        error: at("error"),
        fatal: at("fatal"),
        info: at("info"),
        trace: at("trace"),
        warn: at("warn"),
        child: () => logger,
    };
    return { logger };
});
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(async () => ({ limited: false, retryAfter: 0 })),
}));
vi.mock("@/lib/client-ip", () => ({ getClientIpFromEnv: () => "127.0.0.1" }));
vi.mock("next/navigation", () => ({
    redirect: (url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    },
}));
vi.mock("@/components/acr/OAuthConsentForm", () => ({
    OAuthConsentForm: (props: Record<string, unknown>) => props,
}));

import { auth } from "@/lib/auth";
import { POST as deviceRoute } from "@/app/api/acr/device/route";
import { POST as consentRoute } from "@/app/api/acr/authorize/route";
import { POST as contextPacketRoute } from "@/app/api/agent-context/context-packets/route";
import { GET as evidenceRoute } from "@/app/api/agent-context/evidence/[evidenceRefId]/route";
import OAuthAuthorizePage from "@/app/acr/authorize/page";
import { authorizeAskDevBrowser } from "../service";
// ops authorization_decision.v1 examples, byte copies at the live vendor pin 5389c1f1 (wire: ops
// internal/auth/authapi/authorize_wire.go:78-153; checked by sha256 in issue-allowlist-vocabulary.test.ts).
import severalKeys from "./testdata/ops-5389c1f1/decision-valid-allow-allowlist-several-keys.json";
import emptyAllowlist from "./testdata/ops-5389c1f1/decision-valid-empty-allowlist.json";
import tooLarge from "./testdata/ops-5389c1f1/decision-valid-reason-repository-allowlist-too-large.json";
import atTheBound from "./testdata/ops-5389c1f1/decision-valid-allowlist-at-the-bound.json";
import overTheBound from "./testdata/ops-5389c1f1/decision-invalid-allowlist-over-the-bound.json";
import nestedKeys from "./testdata/ops-5389c1f1/decision-valid-allowlist-nested-keys.json";
import wildcardAllowlist from "./testdata/ops-5389c1f1/decision-valid-allow-allowlist-wildcard.json";

// The log message of src/lib/acr/grantScopes.ts, spelled here so this file runs (red) on a tree without it.
const GRANT_DECISION_MESSAGE = "acr scopes decided from grants";
const ORG = "org-123";
const WEB_ORIGIN = "https://app.example.test";
const ACR = "https://acr.example.test";
const ACR_ISSUER = "https://acr-public.example.test";
const OPS = "http://ops.example.test";
const HANDLE = "H".repeat(43);
const SID = "ses_AAAAAAAAAAAAAAAAAAAAAQ";
const CATALOG = ["acme/alpha", "acme/beta", "acme/gamma"];
const MCP_REDIRECT = "http://localhost:53141/cb?code=c0de&state=s7a7e";
const BROWSER_REDIRECT = `${WEB_ORIGIN}/ask-dev/oauth/callback?code=c0de&state=s7a7e&iss=${encodeURIComponent(ACR_ISSUER)}`;

function opsToken(claims: Record<string, unknown> = { sid: SID }): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "user-123", tv: 1, ...claims })}.c2lnbmF0dXJl`;
}
const TOKEN = opsToken();

// ---- the PDP double (ops catalog 18 shapes) ----
type Answer = "org-wide" | "deny" | { allowlist: readonly string[] };
type Policy = {
    issue: Answer;
    read: (action: string, key: string) => Answer;
};
type Asked = { action: string; type: string; key: string; organizationId: unknown };
const asked: Asked[] = [];
const ALL_ORG_WIDE: Policy = { issue: "org-wide", read: () => "org-wide" };

function decisionDoc(answer: Answer, reasonAllow: string): Record<string, unknown> {
    const allowed = answer !== "deny";
    return {
        schema_version: "authorization_decision.v1",
        decision_id: "dec_" + "A".repeat(26),
        allowed,
        reason_code: allowed ? reasonAllow : "repository_not_granted",
        principal_id: "prn_abc",
        organization_id: ORG,
        policy_revision: 18,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        ...(answer === "org-wide"
            ? { obligations: { tenant_scope: ORG, repository_scope: "organization" } }
            : typeof answer === "object"
              ? { obligations: { tenant_scope: ORG, repository_allowlist: answer.allowlist } }
              : {}),
    };
}

function pdp(policy: Policy): Transport {
    return async (call) => {
        const parsed = JSON.parse(call.body) as Record<string, unknown>;
        const requests = (call.path === "/v1/authorize:batch" ? parsed["requests"] : [parsed]) as {
            principal_reference: string;
            action: string;
            resource: Record<string, unknown>;
        }[];
        const docs = requests.map((r) => {
            expect(r.principal_reference).toBe(TOKEN);
            const key = String(r.resource["key"]);
            asked.push({
                action: r.action,
                type: String(r.resource["type"]),
                key,
                organizationId: r.resource["organization_id"],
            });
            if (r.action === "acr.credential.issue")
                return decisionDoc(policy.issue, "allowed_by_role");
            // The real PDP refuses the "*" repository key (ops evaluate.go: repo-wildcard-key-is-refused).
            if (key === "*") return decisionDoc("deny", "");
            const answer = policy.read(r.action, key);
            // An exact grant's per-key allow names only that key.
            return decisionDoc(
                typeof answer === "object"
                    ? answer.allowlist.includes(key)
                        ? { allowlist: [key] }
                        : "deny"
                    : answer,
                "allowed_by_membership_default",
            );
        });
        const body =
            call.path === "/v1/authorize:batch"
                ? {
                      schema_version: "authorization_batch_response.v1",
                      decisions: docs.map((decision, index) => ({ index, decision })),
                  }
                : docs[0];
        return { status: 200, body: JSON.stringify(body) };
    };
}

// ---- Ops and the ACR peer ----
type Observed = {
    catalogReads: number;
    acrBodies: Record<string, unknown>[];
    acrScopes: unknown[];
};
let observed: Observed;
let publicKey = generateKeyPairSync("ed25519").publicKey;
const tmp: string[] = [];
const server = setupServer();

function installOps(input: { catalog?: readonly string[]; impersonating?: boolean } = {}): void {
    server.use(
        http.get(`${OPS}/api/v1/admin/impersonate/status`, () =>
            HttpResponse.json({ is_impersonating: input.impersonating === true }),
        ),
        http.get(`${OPS}/api/v1/licensing/entitlements/:orgId`, () =>
            HttpResponse.json({ features: { agent_context_runtime: true }, is_valid: true }),
        ),
        http.post(`${OPS}/graphql`, () => {
            observed.catalogReads += 1;
            return HttpResponse.json({
                data: {
                    catalog: {
                        values: (input.catalog ?? CATALOG).map((value) => ({ count: 1, value })),
                    },
                },
            });
        }),
    );
}

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
    client_name: "Claude Code",
    client_self_asserted: false,
    expires_at: "2026-11-08T23:00:00Z",
    redirect_origin: "http://localhost:53141",
    resource: "https://mcp.example.test/mcp",
    scopes: ["context:read", "evidence:read"],
};
const BROWSER_PREVIEW = {
    ...MCP_PREVIEW,
    client_name: "Dev Health",
    redirect_origin: WEB_ORIGIN,
    resource: ACR_ISSUER,
};

function installAcr(preview: Record<string, unknown> = MCP_PREVIEW): void {
    const capture = async (request: Request): Promise<Record<string, unknown>> => {
        const assertion = request.headers.get("x-acr-web-assertion") ?? "";
        const [header, payload, signature] = assertion.split(".");
        if (!header || !payload || !signature) throw new Error("no web assertion");
        expect(
            verify(
                null,
                Buffer.from(`${header}.${payload}`),
                publicKey,
                Buffer.from(signature, "base64url"),
            ),
        ).toBe(true);
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
            string,
            unknown
        >;
        observed.acrScopes.push(claims["repository_scopes"]);
        const text = await request.text();
        if (text && (request.headers.get("content-type") ?? "").startsWith("application/json")) {
            expect(claims["body_sha256"]).toBe(
                createHash("sha256").update(text).digest("base64url"),
            );
            const body = JSON.parse(text) as Record<string, unknown>;
            observed.acrBodies.push(body);
            return body;
        }
        return {};
    };
    server.use(
        http.post(`${ACR}/api/v1/oauth/device_approval`, async ({ request }) => {
            const body = await capture(request);
            return body["schema_version"] === "device_approval_request.v1"
                ? HttpResponse.json({
                      schema_version: "device_approval_response.v1",
                      status: "approved",
                  })
                : HttpResponse.json({ schema_version: "device_approval_preview_response.v1" });
        }),
        http.post(`${ACR}/authorize/consent`, async ({ request }) => {
            const body = await capture(request);
            if (body["action"] === "preview") return HttpResponse.json(preview);
            return HttpResponse.json({
                redirect_url: preview === BROWSER_PREVIEW ? BROWSER_REDIRECT : MCP_REDIRECT,
            });
        }),
        http.post(`${ACR}/authorize/first-party`, async ({ request }) => {
            await capture(request);
            return new HttpResponse(null, {
                status: 302,
                headers: { location: `${WEB_ORIGIN}/acr/authorize?handle=${HANDLE}` },
            });
        }),
        http.get(`${ACR}/api/v1/agent-context/capabilities`, async ({ request }) => {
            await capture(request);
            return HttpResponse.json(CAPABILITIES);
        }),
        http.post(`${ACR}/api/v1/agent-context/context-packets`, async ({ request }) => {
            await capture(request);
            return HttpResponse.json({ schema_version: "context_packet.v1" });
        }),
        http.get(`${ACR}/api/v1/agent-context/evidence/:id`, async ({ request }) => {
            await capture(request);
            return HttpResponse.json({ schema_version: "expanded_evidence.v1" });
        }),
    );
}

function signIn(user: Record<string, unknown> = {}): void {
    vi.mocked(auth).mockResolvedValue({
        access_token: TOKEN,
        expires: "2026-11-16T00:00:00.000Z",
        user: { id: "user-123", org_id: ORG, real_org_id: ORG, role: "member", ...user },
    } as never);
}

function post(path: string, body: unknown): Request {
    return new Request(`${WEB_ORIGIN}${path}`, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", origin: WEB_ORIGIN },
        method: "POST",
    });
}
const deviceApprove = (scopes: readonly string[]) =>
    deviceRoute(
        post("/api/acr/device", {
            action: "approve",
            repository_scopes: scopes,
            user_code: "ABCD2345",
        }),
    );
const devicePreview = () =>
    deviceRoute(post("/api/acr/device", { action: "preview", user_code: "ABCD2345" }));
const consentApprove = (scopes: readonly string[]) =>
    consentRoute(
        post("/api/acr/authorize", {
            action: "approve",
            handle: HANDLE,
            repository_scopes: scopes,
        }),
    );

const issueAsks = () => asked.filter((a) => a.action === "acr.credential.issue");
const readAsks = () => asked.filter((a) => a.action !== "acr.credential.issue");
const grantLines = () => logSink.lines.filter((l) => l.msg === GRANT_DECISION_MESSAGE);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "acr-issuance-grants-"));
    tmp.push(dir);
    const pair = generateKeyPairSync("ed25519");
    publicKey = pair.publicKey;
    const keyFile = join(dir, "web-assertion.key");
    writeFileSync(keyFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
    chmodSync(keyFile, 0o600);
    vi.stubEnv("ACR_API_ORIGIN", ACR);
    vi.stubEnv("ACR_OAUTH_ISSUER", ACR_ISSUER);
    vi.stubEnv("ACR_REQUEST_TIMEOUT_MS", "5000");
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", keyFile);
    vi.stubEnv("ACR_WEB_ASSERTION_KID", "web-key-2026");
    vi.stubEnv("AUTH_URL", WEB_ORIGIN);
    vi.stubEnv("BACKEND_URL", OPS);
    vi.stubEnv("ACR_SCOPES_FROM_GRANTS", "true");
    observed = { catalogReads: 0, acrBodies: [], acrScopes: [] };
    asked.length = 0;
    logSink.lines.length = 0;
    seam.transport = pdp(ALL_ORG_WIDE);
    signIn();
    installOps();
    installAcr();
});
afterEach(() => {
    server.resetHandlers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    for (const dir of tmp.splice(0)) rmSync(dir, { force: true, recursive: true });
});

describe("ACR_SCOPES_FROM_GRANTS on: device approval and consent", () => {
    it.each(["viewer", "member", "admin", "owner"])(
        'Given a %s on the membership default, when approving the device org-wide, then acr.credential.issue decides on the session org and ["*"] is sent',
        async (role) => {
            signIn({ role });
            const response = await deviceApprove(["*"]);
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ status: "approved" });
            expect(issueAsks()).toEqual([
                {
                    action: "acr.credential.issue",
                    type: "organization",
                    key: ORG,
                    organizationId: ORG,
                },
            ]);
            expect(observed.acrBodies.at(-1)?.["repository_scopes"]).toEqual(["*"]);
            expect(observed.acrScopes.at(-1)).toEqual(["*"]);
        },
    );

    it.each(["viewer", "member", "admin", "owner"])(
        'Given a %s on the membership default, when approving consent org-wide, then ["*"] is sent on preview and approve',
        async (role) => {
            signIn({ role });
            const response = await consentApprove(["*"]);
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ redirect_url: MCP_REDIRECT });
            expect(observed.acrScopes).toEqual([["*"], ["*"]]);
            expect(observed.acrBodies.at(-1)).toEqual({
                action: "approve",
                handle: HANDLE,
                repository_scopes: ["*"],
            });
            expect(issueAsks()).toHaveLength(2);
        },
    );

    it("Given an org-wide caller who names repositories, then exactly those names are sent (never widened)", async () => {
        const response = await deviceApprove(["acme/beta"]);
        expect(response.status).toBe(200);
        expect(observed.acrBodies.at(-1)?.["repository_scopes"]).toEqual(["acme/beta"]);
        expect(observed.acrScopes.at(-1)).toEqual(["acme/beta"]);
    });

    // The real PDP never gives this pair: the same grant rows make both decisions (ops scope.go:20-50, A5/A6). The
    // issue allowlist is the answer: a named allow never issues "*".
    it('Given the credential.issue allow names repositories and the reads are org-wide, then the named allowlist is sent, never ["*"], with no read decision', async () => {
        seam.transport = pdp({ issue: { allowlist: CATALOG }, read: () => "org-wide" });
        const response = await deviceApprove(["*"]);
        expect(response.status).toBe(200);
        expect(observed.acrScopes.at(-1)).toEqual(CATALOG);
        expect(readAsks()).toEqual([]);
        expect(observed.catalogReads).toBe(0);
    });

    it('Given a platform admin with no membership row (credential.issue org-wide, every read denied), then ["*"] is sent with no read decision and no catalog read', async () => {
        seam.transport = pdp({ issue: "org-wide", read: () => "deny" });
        signIn({ is_superuser: true });
        expect((await deviceApprove(["*"])).status).toBe(200);
        expect((await consentApprove(["*"])).status).toBe(200);
        expect(observed.acrScopes).toEqual([["*"], ["*"], ["*"]]);
        expect(readAsks()).toEqual([]);
        expect(observed.catalogReads).toBe(0);
    });

    // m6: "*" only from the marker. A platform admin whose credential.issue allow lacks it gets no "*".
    it("Given a platform admin whose credential.issue allow carries no org-wide marker and every read is denied, then it is refused 403 and nothing is sent", async () => {
        seam.transport = pdp({ issue: { allowlist: [] }, read: () => "deny" });
        signIn({ is_superuser: true });
        const response = await deviceApprove(["*"]);
        expect(response.status).toBe(403);
        expect(observed.acrBodies).toEqual([]);
    });

    // m5: an allow for every current repository is not org-wide: the named list, never "*".
    it('Given exact grants that cover every catalog repository (allowlists, no marker), then the named list is sent, never ["*"]', async () => {
        seam.transport = pdp({
            issue: { allowlist: CATALOG },
            read: () => ({ allowlist: CATALOG }),
        });
        const response = await deviceApprove(["*"]);
        expect(response.status).toBe(200);
        expect(observed.acrBodies.at(-1)?.["repository_scopes"]).toEqual(CATALOG);
        expect(observed.acrScopes.at(-1)).toEqual(CATALOG);
    });

    // m4: the scopes are what the decisions allow, not the catalog list.
    it("Given an exact-grant holder, when approving org-wide, then the allowed names only are sent", async () => {
        seam.transport = pdp({
            issue: { allowlist: ["acme/alpha", "acme/gamma"] },
            read: () => ({ allowlist: ["acme/alpha", "acme/gamma"] }),
        });
        expect((await deviceApprove(["*"])).status).toBe(200);
        expect(observed.acrBodies.at(-1)?.["repository_scopes"]).toEqual([
            "acme/alpha",
            "acme/gamma",
        ]);
        expect(observed.acrScopes.at(-1)).toEqual(["acme/alpha", "acme/gamma"]);
    });

    it("Given an exact-grant holder who names only a repository it may not read, then it is refused 403 and nothing is sent", async () => {
        seam.transport = pdp({
            issue: { allowlist: ["acme/alpha"] },
            read: () => ({ allowlist: ["acme/alpha"] }),
        });
        const response = await deviceApprove(["acme/beta"]);
        expect(response.status).toBe(403);
        expect(observed.acrBodies).toEqual([]);
    });

    // The empty-catalog probe is gone: an org-wide principal is org-wide at acr.credential.issue by the same row rule.
    it("Given an empty credential.issue allowlist and org-wide reads, then it is refused 403 with no probe, no read decision and no catalog read", async () => {
        seam.transport = pdp({ issue: { allowlist: [] }, read: () => "org-wide" });
        installOps({ catalog: [] });
        expect((await deviceApprove(["*"])).status).toBe(403);
        expect(observed.acrBodies).toEqual([]);
        expect(readAsks()).toEqual([]);
        expect(observed.catalogReads).toBe(0);
    });

    it("Given an empty catalog and an exact-grant holder, then it is refused 403", async () => {
        seam.transport = pdp({
            issue: { allowlist: [] },
            read: () => ({ allowlist: ["acme/alpha"] }),
        });
        installOps({ catalog: [] });
        expect((await deviceApprove(["*"])).status).toBe(403);
        expect(observed.acrBodies).toEqual([]);
    });

    // m1: acr.credential.issue decides.
    it.each([
        ["device approve", () => deviceApprove(["*"])],
        ["device preview", () => devicePreview()],
        ["consent approve", () => consentApprove(["*"])],
    ])(
        "Given acr.credential.issue denies, when %s, then it is refused 403 and ACR is never called",
        async (_n, call) => {
            seam.transport = pdp({ issue: "deny", read: () => "org-wide" });
            const response = await call();
            expect(response.status).toBe(403);
            expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
                "not_entitled",
            );
            expect(observed.acrBodies).toEqual([]);
        },
    );

    it.each([
        ["no transport", null],
        ["a 503 from the decision point", (async () => ({ status: 503, body: "" })) as Transport],
    ])(
        "Given %s, when approving, then it refuses 503 unavailable (no legacy fallback) and ACR is never called",
        async (_n, transport) => {
            seam.transport = transport;
            const response = await deviceApprove(["*"]);
            expect(response.status).toBe(503);
            expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
                "unavailable",
            );
            expect(observed.acrBodies).toEqual([]);
        },
    );

    // m2: impersonation refuses before any decision (flaw F1: no new narrowing, no widening).
    it.each([
        ["device approve", () => deviceApprove(["*"])],
        ["consent approve", () => consentApprove(["*"])],
    ])(
        "Given an impersonating session, when %s, then it is refused 403 with NO decision asked",
        async (_n, call) => {
            installOps({ impersonating: true });
            const response = await call();
            expect(response.status).toBe(403);
            expect(asked).toEqual([]);
            expect(observed.acrBodies).toEqual([]);
        },
    );
});

// CHAOS-13541 (11205 P1): a `*` request whose acr.credential.issue allow is not org-wide takes its scopes from that
// allow's repository_allowlist (ops internal/auth/authorization/scope.go:20-50, :58-94 at 5389c1f1). No catalog read
// and no read decision on the issuance path; a named request keeps its per-key decisions.
// acr.credential.issue answers with the ops example decision, verbatim; the reads (named requests only) use the double.
function issueAnswers(doc: unknown, read: Policy["read"] = () => "deny"): Transport {
    const reads = pdp({ issue: "deny", read });
    return async (call) => {
        const parsed = JSON.parse(call.body) as Record<string, unknown>;
        if (call.path === "/v1/authorize" && parsed["action"] === "acr.credential.issue") {
            expect(parsed["principal_reference"]).toBe(TOKEN);
            const resource = parsed["resource"] as Record<string, unknown>;
            asked.push({
                action: "acr.credential.issue",
                type: String(resource["type"]),
                key: String(resource["key"]),
                organizationId: resource["organization_id"],
            });
            return { status: 200, body: JSON.stringify(doc) };
        }
        return reads(call);
    };
}
const SEVERAL_KEYS = ["acme/api", "acme/web", "full-chaos/dev-health-ops"];
const errorOf = async (response: Response) =>
    ((await response.json()) as { error: { code: string; message: string } }).error;

describe("ACR_SCOPES_FROM_GRANTS on: `*` scopes from the acr.credential.issue allowlist", () => {
    it.each([
        ["device approve", () => deviceApprove(["*"]), 1],
        ["consent approve", () => consentApprove(["*"]), 2],
    ])(
        "Given a named credential.issue allow, when %s for every repository, then the allowlist is sent with no catalog read and no read decision",
        async (_n, call, assertions) => {
            seam.transport = issueAnswers(severalKeys);
            const response = await call();
            expect(response.status).toBe(200);
            expect(observed.catalogReads).toBe(0);
            expect(readAsks()).toEqual([]);
            expect(observed.acrScopes).toEqual(Array(assertions).fill(SEVERAL_KEYS));
            expect(observed.acrBodies.at(-1)?.["repository_scopes"]).toEqual(SEVERAL_KEYS);
        },
    );

    // A1 (answer change, wider): the grant set decides, not the catalog. full-chaos/dev-health-ops is not in CATALOG.
    it("Given a grant on a repository absent from the analytics catalog, then that repository is issued", async () => {
        seam.transport = issueAnswers(severalKeys);
        expect(CATALOG).not.toContain("full-chaos/dev-health-ops");
        expect((await deviceApprove(["*"])).status).toBe(200);
        expect(observed.acrScopes.at(-1)).toContain("full-chaos/dev-health-ops");
    });

    it("Given an empty credential.issue allowlist (no live grant), then it is refused 403 no_scopes with no catalog read and no read decision", async () => {
        seam.transport = issueAnswers(emptyAllowlist, () => "org-wide");
        const response = await deviceApprove(["*"]);
        expect(response.status).toBe(403);
        expect((await errorOf(response)).code).toBe("not_entitled");
        expect(observed.acrBodies).toEqual([]);
        expect(observed.catalogReads).toBe(0);
        expect(readAsks()).toEqual([]);
        expect(grantLines().map((l) => (l.fields as { outcome: string }).outcome)).toEqual([
            "no_scopes",
        ]);
    });

    it("Given 256 granted repositories (the allowlist bound), then all 256 are sent", async () => {
        seam.transport = issueAnswers(atTheBound);
        const keys = atTheBound.obligations.repository_allowlist;
        expect(keys).toHaveLength(256);
        expect((await deviceApprove(["*"])).status).toBe(200);
        expect(observed.acrScopes.at(-1)).toEqual(keys);
        expect(observed.catalogReads).toBe(0);
    });

    // pm D6973: over 256 explicit grants the PDP denies repository_allowlist_too_large (ops obligations.go:7-10;
    // it never truncates). The refusal names the cap.
    it.each([
        ["device approve", () => deviceApprove(["*"])],
        ["consent approve", () => consentApprove(["*"])],
    ])(
        "Given 257 granted repositories (the PDP denies repository_allowlist_too_large), when %s, then it is refused 403 grant_limit_exceeded naming the 256 cap",
        async (_n, call) => {
            seam.transport = issueAnswers(tooLarge);
            const response = await call();
            expect(response.status).toBe(403);
            const error = await errorOf(response);
            expect(error.code).toBe("grant_limit_exceeded");
            expect(error.message).toContain("256");
            expect(observed.acrBodies).toEqual([]);
            expect(observed.catalogReads).toBe(0);
            expect(grantLines().map((l) => (l.fields as { outcome: string }).outcome)).toEqual([
                "denied",
            ]);
        },
    );

    // RISK-NOTES (pre-existing): acr.credential.issue decides first for every request, so over 256 grants a named
    // request is refused too; it gets the same code and cap message.
    it("Given 257 granted repositories and a named request, then it is refused 403 grant_limit_exceeded naming the 256 cap", async () => {
        seam.transport = issueAnswers(tooLarge, () => ({ allowlist: ["acme/api"] }));
        const response = await deviceApprove(["acme/api"]);
        expect(response.status).toBe(403);
        const error = await errorOf(response);
        expect(error.code).toBe("grant_limit_exceeded");
        expect(error.message).toContain("256");
        expect(observed.acrBodies).toEqual([]);
        expect(readAsks()).toEqual([]);
    });

    it("Given an allow that lists 257 keys (not per contract), then the client refuses it 503 and nothing is sent", async () => {
        seam.transport = issueAnswers(overTheBound);
        expect(overTheBound.obligations.repository_allowlist).toHaveLength(257);
        const response = await deviceApprove(["*"]);
        expect(response.status).toBe(503);
        expect(observed.acrBodies).toEqual([]);
    });

    // A3: the allowlist passes the canonical check (sorted, no repeat) with the full repository key grammar, 2-20
    // segments: the one rule of ops (internal/auth/repokey/repokey.go:27-39), the decision point and ACR
    // (internal/reposlug/reposlug.go:73-87). ACR takes a nested key in a device approval
    // (internal/contracts/v1/validate_device.go:202-213), in a web assertion (internal/auth/web_assertion_binding.go:65-80)
    // and in its read check (internal/auth/repository.go:51-72). No regression: no `*` request is refused for it.
    it("Given an allowlist with nested repository keys (GitLab subgroups), then every key is sent", async () => {
        seam.transport = issueAnswers(nestedKeys);
        const keys = nestedKeys.obligations.repository_allowlist;
        expect(keys).toContain("acme/platform/web");
        expect((await deviceApprove(["*"])).status).toBe(200);
        expect(observed.acrScopes.at(-1)).toEqual(keys);
        expect(observed.acrBodies.at(-1)?.["repository_scopes"]).toEqual(keys);
        expect(observed.catalogReads).toBe(0);
    });

    // A named allow never issues `*`: an allowlist that holds "*" (a valid wire example the decision core never emits,
    // ops authorize_wire.go:148) is not a repository key, so it refuses.
    it('Given an allowlist that holds "*", then it refuses 503 unavailable and nothing is sent', async () => {
        seam.transport = issueAnswers(wildcardAllowlist);
        const response = await deviceApprove(["*"]);
        expect(response.status).toBe(503);
        expect(observed.acrBodies).toEqual([]);
    });

    // The decision point sends its allowlist sorted (ops scope.go:46-50); a list out of byte order refuses.
    it("Given an allowlist out of byte order, then it refuses 503 unavailable and nothing is sent", async () => {
        const unsorted = {
            ...severalKeys,
            obligations: {
                ...severalKeys.obligations,
                repository_allowlist: [...SEVERAL_KEYS].reverse(),
            },
        };
        seam.transport = issueAnswers(unsorted);
        const response = await deviceApprove(["*"]);
        expect(response.status).toBe(503);
        expect(observed.acrBodies).toEqual([]);
    });

    it("Given a named credential.issue allow and a named request, then the per-key read decision decides and the catalog is not read", async () => {
        seam.transport = issueAnswers(severalKeys, () => ({ allowlist: ["acme/api"] }));
        expect((await deviceApprove(["acme/api"])).status).toBe(200);
        expect(observed.acrScopes.at(-1)).toEqual(["acme/api"]);
        expect(readAsks().map((a) => a.key)).toEqual(["*", "acme/api"]);
        expect(observed.catalogReads).toBe(0);
    });

    // Rule 1 (PRODUCT RULES f7cb775dde89): "Platform admins never need org membership; the legacy behaviour stays."
    // ops golden vector allow-platform-admin-no-membership-issues-acr-credential.json: org-wide allow.
    it.each([
        ["device approve", () => deviceApprove(["*"])],
        ["consent approve", () => consentApprove(["*"])],
    ])(
        'Given a platform admin with no membership, when %s for every repository, then ["*"] is sent with no catalog read and no read decision',
        async (_n, call) => {
            seam.transport = pdp({ issue: "org-wide", read: () => "deny" });
            signIn({ is_superuser: true });
            expect((await call()).status).toBe(200);
            expect(observed.acrScopes.at(-1)).toEqual(["*"]);
            expect(observed.catalogReads).toBe(0);
            expect(readAsks()).toEqual([]);
        },
    );
});

// m3: switch off is the legacy path, byte for byte, with no decision asked.
describe("ACR_SCOPES_FROM_GRANTS off", () => {
    it.each(["", "false", "0", "on"])(
        "Given the switch is %j, device and consent run the legacy path and ask NO decision",
        async (value) => {
            vi.stubEnv("ACR_SCOPES_FROM_GRANTS", value);
            seam.transport = pdp({ issue: "deny", read: () => "deny" });
            expect((await deviceApprove(["*"])).status).toBe(200);
            expect((await deviceApprove(["acme/beta"])).status).toBe(200);
            expect((await consentApprove(["*"])).status).toBe(200);
            expect(asked).toEqual([]);
            expect(observed.catalogReads).toBe(0);
            expect(observed.acrScopes).toEqual([["*"], ["acme/beta"], ["*"], ["*"]]);
            expect(grantLines()).toEqual([]);
        },
    );
});

describe("ACR_SCOPES_FROM_GRANTS on: the context and evidence reads", () => {
    it("Given an org-wide context.read decision, the context:read assertion carries the catalog list (legacy bytes)", async () => {
        await contextPacketRoute(
            post("/api/agent-context/context-packets", { goal: "g", repository: "acme/alpha" }),
        );
        expect(observed.acrScopes.at(-1)).toEqual(CATALOG);
        expect(new Set(readAsks().map((a) => a.action))).toEqual(new Set(["acr.context.read"]));
    });

    it("Given the evidence read, the scopes come from acr.evidence.read decisions", async () => {
        seam.transport = pdp({
            issue: "org-wide",
            read: (action) => (action === "acr.evidence.read" ? "org-wide" : "deny"),
        });
        const url = `${WEB_ORIGIN}/api/agent-context/evidence/evref-0001?repository=acme%2Falpha`;
        await evidenceRoute(new Request(url), {
            params: Promise.resolve({ evidenceRefId: "evref-0001" }),
        });
        expect(observed.acrScopes.at(-1)).toEqual(CATALOG);
        expect(new Set(readAsks().map((a) => a.action))).toEqual(new Set(["acr.evidence.read"]));
    });
});

describe("the grant decision log line", () => {
    it("Given a decided device approval, one Info line carries route, org, outcome, count, scopes and source, and no secret", async () => {
        await deviceApprove(["*"]);
        const lines = grantLines();
        expect(lines).toHaveLength(1);
        expect(lines[0]?.level).toBe("info");
        expect(lines[0]?.fields).toEqual({
            module: "acr-grant-scopes",
            route: "device",
            orgId: ORG,
            outcome: "allowed",
            scopeCount: null,
            scopes: "*",
            source: "org-wide",
            markerFrom: "acr.credential.issue",
        });
        const text = JSON.stringify(logSink.lines);
        for (const secret of [TOKEN, SID, "ABCD2345", HANDLE, "c0de"])
            expect(text).not.toContain(secret);
        expect(text).not.toMatch(/token|assertion|credential"|password|secret/iu);
    });

    it("Given a named list and a refusal, each gets its line with the named scopes or no scopes", async () => {
        seam.transport = pdp({
            issue: { allowlist: ["acme/alpha"] },
            read: () => ({ allowlist: ["acme/alpha"] }),
        });
        await deviceApprove(["*"]);
        await deviceApprove(["acme/beta"]);
        expect(grantLines().map((l) => l.fields)).toEqual([
            expect.objectContaining({
                outcome: "allowed",
                scopeCount: 1,
                scopes: ["acme/alpha"],
                source: "named",
            }),
            expect.objectContaining({
                outcome: "no_scopes",
                scopeCount: 0,
                scopes: [],
                source: "named",
            }),
        ]);
    });

    it("Given the context and evidence reads, each logs its route", async () => {
        await contextPacketRoute(
            post("/api/agent-context/context-packets", { goal: "g", repository: "acme/alpha" }),
        );
        const url = `${WEB_ORIGIN}/api/agent-context/evidence/evref-0001?repository=acme%2Falpha`;
        await evidenceRoute(new Request(url), {
            params: Promise.resolve({ evidenceRefId: "evref-0001" }),
        });
        expect(grantLines().map((l) => (l.fields as { route: string }).route)).toEqual([
            "context",
            "evidence",
        ]);
    });
});

// D6857 Q2: Ask Dev and the first-party approve are not wired to the switch.
describe("Ask Dev and the first-party approve ignore ACR_SCOPES_FROM_GRANTS", () => {
    it('Given the switch on, the consent page\'s first-party approve sends ["*"] and asks no decision of its own', async () => {
        installAcr(BROWSER_PREVIEW);
        await expect(
            OAuthAuthorizePage({ searchParams: Promise.resolve({ handle: HANDLE }) }),
        ).rejects.toThrow("NEXT_REDIRECT");
        // One decision: the preview's (the consent page decides its preview); the approve asks none.
        expect(issueAsks()).toHaveLength(1);
        expect(observed.acrBodies.at(-1)).toEqual({
            action: "approve",
            handle: HANDLE,
            repository_scopes: ["*"],
        });
        expect(observed.acrScopes.at(-1)).toEqual(["*"]);
    });

    it("Given the switch on and no transport at all, Ask Dev's silent authorize asks no decision and gets its code", async () => {
        seam.transport = null;
        installAcr(BROWSER_PREVIEW);
        const answer = await authorizeAskDevBrowser({
            codeChallenge: "c".repeat(43),
            signal: new AbortController().signal,
            state: "s7a7e",
        });
        expect(answer).toEqual({
            kind: "authorized",
            code: "c0de",
            state: "s7a7e",
            iss: ACR_ISSUER,
        });
        expect(asked).toEqual([]);
        expect(grantLines()).toEqual([]);
    });
});
