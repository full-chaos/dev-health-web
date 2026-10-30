// CHAOS-12095 (design T4c): the web SERVER signs the session id (`sid`) of its own Ops session
// token and the impersonation state of the Ops status read into every `credential:issue`
// assertion. Consent refuses while the session impersonates, by that state (not by an org
// mismatch). The first-party browser client completes its authorization with no click, server
// to server, with the live org scope grant; third-party MCP clients keep the consent page.
import { generateKeyPairSync, verify } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const { redirectMock } = vi.hoisted(() => ({
    redirectMock: vi.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    }),
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));
vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(async () => ({ limited: false, retryAfter: 0 })),
}));
vi.mock("@/lib/client-ip", () => ({ getClientIpFromEnv: () => "127.0.0.1" }));
vi.mock("@/components/acr/OAuthConsentForm", () => ({
    OAuthConsentForm: (props: Record<string, unknown>) => props,
}));

import { auth } from "@/lib/auth";
import { AcrRuntimeClient } from "../client";
import { loadAcrRuntimeConfig } from "../config";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "../errors";
import {
    approveDeviceAuthorization,
    decideOAuthConsent,
    previewDeviceAuthorization,
    previewOAuthConsent,
} from "../service";
import OAuthAuthorizePage from "@/app/acr/authorize/page";
import { POST as consentRoute } from "@/app/api/acr/authorize/route";

const server = setupServer();
const temporaryPaths: string[] = [];
let publicKey = generateKeyPairSync("ed25519").publicKey;

const HANDLE = "H".repeat(43);
const SERVER_SID = "ses_AAAAAAAAAAAAAAAAAAAAAQ";
const FORGED_SID = "ses_FORGEDFORGEDFORGEDFOR";
const WEB_ORIGIN = "https://app.example.test";
const ACR_ISSUER = "https://acr-public.example.test";
const CONSENT_URL = "https://acr.example.test/authorize/consent";
const STATUS_URL = "http://ops.example.test/api/v1/admin/impersonate/status";

/** An Ops access token as the web server holds it: a JWT whose payload carries `sid`. */
function opsAccessToken(claims: Record<string, unknown>): string {
    const encode = (value: object) =>
        Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
    return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
        sub: "user-123",
        tv: 1,
        ...claims,
    })}.c2lnbmF0dXJl`;
}

function writeSigningKey(): string {
    const pair = generateKeyPairSync("ed25519");
    publicKey = pair.publicKey;
    const directory = mkdtempSync(join(tmpdir(), "acr-consent-provenance-"));
    temporaryPaths.push(directory);
    const keyFile = join(directory, "web-assertion.key");
    writeFileSync(keyFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
    chmodSync(keyFile, 0o600);
    return keyFile;
}

function configure(): void {
    vi.stubEnv("ACR_API_ORIGIN", "https://acr.example.test");
    vi.stubEnv("ACR_OAUTH_ISSUER", ACR_ISSUER);
    vi.stubEnv("ACR_REQUEST_TIMEOUT_MS", "5000");
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", writeSigningKey());
    vi.stubEnv("ACR_WEB_ASSERTION_KID", "web-key-2026");
    vi.stubEnv("AUTH_URL", WEB_ORIGIN);
    vi.stubEnv("BACKEND_URL", "http://ops.example.test");
}

function authenticate(
    user: Record<string, unknown> = {},
    tokenClaims: Record<string, unknown> = { sid: SERVER_SID },
): void {
    vi.mocked(auth).mockResolvedValue({
        access_token: opsAccessToken(tokenClaims),
        expires: "2026-11-16T00:00:00.000Z",
        user: { id: "user-123", org_id: "org-123", real_org_id: "org-123", ...user },
    });
}

type Observed = {
    readonly acrBodies: Record<string, unknown>[];
    readonly acrClaims: Record<string, unknown>[];
    statusReads: number;
};

function decodeAssertion(value: string): Record<string, unknown> {
    const [header, payload, signature] = value.split(".");
    if (!header || !payload || !signature) throw new Error("malformed assertion");
    expect(
        verify(
            null,
            Buffer.from(`${header}.${payload}`),
            publicKey,
            Buffer.from(signature, "base64url"),
        ),
    ).toBe(true);
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
        string,
        unknown
    >;
}

const MCP_PREVIEW = {
    client_kind: "metadata_document",
    client_name: "Claude Code",
    client_self_asserted: false,
    expires_at: "2026-10-30T20:00:00Z",
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

const BROWSER_REDIRECT = `${WEB_ORIGIN}/ask-dev/oauth/callback?code=c0de&state=s7a7e&iss=${encodeURIComponent(ACR_ISSUER)}`;

function installOps(input: { impersonating?: boolean; statusCode?: number } = {}): Observed {
    const observed: Observed = { acrBodies: [], acrClaims: [], statusReads: 0 };
    server.use(
        http.get(STATUS_URL, ({ request }) => {
            observed.statusReads += 1;
            expect(request.headers.get("authorization")).toMatch(/^Bearer /u);
            if (input.statusCode !== undefined && input.statusCode !== 200) {
                return HttpResponse.json({ detail: "unavailable" }, { status: input.statusCode });
            }
            return HttpResponse.json(
                input.impersonating
                    ? {
                          expires_at: "2026-10-30T21:00:00Z",
                          is_impersonating: true,
                          target_email: "member@example.test",
                          // Same organization: the org-mismatch test cannot see this one.
                          target_org_id: "org-123",
                          target_user_id: "user-456",
                      }
                    : {
                          expires_at: null,
                          is_impersonating: false,
                          target_email: null,
                          target_org_id: null,
                          target_user_id: null,
                      },
            );
        }),
        http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
            HttpResponse.json({ features: { agent_context_runtime: true }, is_valid: true }),
        ),
    );
    return observed;
}

function installAcr(observed: Observed, preview: Record<string, unknown> = MCP_PREVIEW): void {
    const capture = async (request: Request): Promise<Record<string, unknown>> => {
        const assertion = request.headers.get("x-acr-web-assertion");
        if (!assertion) throw new Error("no web assertion");
        observed.acrClaims.push(decodeAssertion(assertion));
        const body = JSON.parse(await request.text()) as Record<string, unknown>;
        observed.acrBodies.push(body);
        return body;
    };
    server.use(
        http.post(CONSENT_URL, async ({ request }) => {
            const body = await capture(request);
            if (body.action === "preview") return HttpResponse.json(preview);
            if (body.action === "approve")
                return HttpResponse.json({ redirect_url: BROWSER_REDIRECT });
            return HttpResponse.json({ redirect_url: `${WEB_ORIGIN}/cb?error=access_denied` });
        }),
        http.post("https://acr.example.test/api/v1/oauth/device_approval", async ({ request }) => {
            const body = await capture(request);
            return body.schema_version === "device_approval_request.v1"
                ? HttpResponse.json({
                      schema_version: "device_approval_response.v1",
                      status: "approved",
                  })
                : HttpResponse.json({ schema_version: "device_approval_preview_response.v1" });
        }),
    );
}

function routeRequest(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request(`${WEB_ORIGIN}/api/acr/authorize`, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", origin: WEB_ORIGIN, ...headers },
        method: "POST",
    });
}

const signal = () => new AbortController().signal;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
    configure();
    authenticate();
});
afterEach(() => {
    server.resetHandlers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    for (const temporaryPath of temporaryPaths.splice(0)) {
        rmSync(temporaryPath, { force: true, recursive: true });
    }
});

describe("credential:issue provenance", () => {
    it("Given an MCP consent, when previewing and approving, then each assertion carries the server session's sid and impersonating=false", async () => {
        const observed = installOps();
        installAcr(observed);

        await previewOAuthConsent({ handle: HANDLE, signal: signal() });
        await decideOAuthConsent({
            action: "approve",
            handle: HANDLE,
            repositoryScopes: ["full-chaos/platform"],
            signal: signal(),
        });

        expect(observed.acrClaims.map((claims) => claims.sid)).toEqual([
            SERVER_SID,
            SERVER_SID,
            SERVER_SID,
        ]);
        expect(observed.acrClaims.map((claims) => claims.impersonating)).toEqual([
            false,
            false,
            false,
        ]);
        // Still 30 s, one use, bound to method, path and body.
        for (const claims of observed.acrClaims) {
            expect(Number(claims.exp) - Number(claims.iat)).toBe(30);
            expect(claims).toMatchObject({ method: "POST", path: "/authorize/consent" });
            expect(typeof claims.jti).toBe("string");
            expect(typeof claims.body_sha256).toBe("string");
        }
        expect(new Set(observed.acrClaims.map((claims) => claims.jti)).size).toBe(3);
        expect(observed.statusReads).toBeGreaterThanOrEqual(2);
    });

    it("Given a device approval, when approving, then the assertion carries the server session's sid and impersonating=false", async () => {
        const observed = installOps();
        installAcr(observed);

        await previewDeviceAuthorization({ signal: signal(), userCode: "ABCD2345" });
        await approveDeviceAuthorization({
            repositoryScopes: ["full-chaos/platform"],
            signal: signal(),
            userCode: "ABCD2345",
        });

        expect(observed.acrClaims).toHaveLength(2);
        for (const claims of observed.acrClaims) {
            expect(claims).toMatchObject({ impersonating: false, sid: SERVER_SID });
        }
    });

    it("Given an Ops token with no sid, when approving an MCP client, then no sid claim is signed and impersonating=false still is", async () => {
        authenticate({}, {});
        const observed = installOps();
        installAcr(observed);

        await decideOAuthConsent({
            action: "approve",
            handle: HANDLE,
            repositoryScopes: ["full-chaos/platform"],
            signal: signal(),
        });

        expect(observed.acrClaims.at(-1)).not.toHaveProperty("sid");
        expect(observed.acrClaims.at(-1)).toMatchObject({ impersonating: false });
    });

    it("Given a forged sid and impersonation flag in the request, when the route approves, then the assertion carries only the server-derived values", async () => {
        const observed = installOps();
        installAcr(observed);

        const response = await consentRoute(
            routeRequest(
                {
                    action: "approve",
                    handle: HANDLE,
                    impersonating: false,
                    repository_scopes: ["full-chaos/platform"],
                    session_id: FORGED_SID,
                    sid: FORGED_SID,
                },
                { "x-acr-session-id": FORGED_SID, "x-session-id": FORGED_SID },
            ),
        );

        expect(response.status).toBe(200);
        const approve = observed.acrClaims.at(-1);
        expect(approve).toMatchObject({ impersonating: false, sid: SERVER_SID });
        expect(JSON.stringify(observed.acrClaims)).not.toContain(FORGED_SID);
        expect(JSON.stringify(observed.acrBodies)).not.toContain(FORGED_SID);
        expect(observed.acrBodies.at(-1)).toEqual({
            action: "approve",
            handle: HANDLE,
            repository_scopes: ["full-chaos/platform"],
        });
    });
    it("Given an authorization that carries provenance, when a data route is signed, then the assertion has no sid and no impersonating claim", async () => {
        let claims: Record<string, unknown> | undefined;
        server.use(
            http.get(
                "https://acr.example.test/api/v1/agent-context/capabilities",
                ({ request }) => {
                    const assertion = request.headers.get("x-acr-web-assertion");
                    if (assertion) claims = decodeAssertion(assertion);
                    return HttpResponse.json({ error: { code: "upstream" } }, { status: 503 });
                },
            ),
        );

        await new AcrRuntimeClient(loadAcrRuntimeConfig())
            .capabilities({
                authorization: {
                    orgId: "org-123",
                    provenance: { impersonating: false, sessionId: SERVER_SID },
                    repositoryScopes: ["full-chaos/platform"],
                    subject: "user-123",
                },
                signal: signal(),
            })
            .catch(() => undefined);

        expect(claims).toBeDefined();
        expect(claims).not.toHaveProperty("sid");
        expect(claims).not.toHaveProperty("impersonating");
    });
});

// The claim set this web signed before CHAOS-12095: an ACR without the browser-class parser
// refuses any other claim, so with ACR_OAUTH_ISSUER unset the assertion must be exactly this.
const PRE_PROVENANCE_CLAIMS = [
    "aud",
    "body_sha256",
    "exp",
    "iat",
    "iss",
    "jti",
    "method",
    "nbf",
    "org_id",
    "path",
    "permissions",
    "repository_scopes",
    "sub",
];

describe("provenance claims follow ACR_OAUTH_ISSUER", () => {
    it.each([
        ["unset", ""],
        ["blank", "   "],
    ])(
        "Given ACR_OAUTH_ISSUER is %s, when MCP consent and device approval run, then every assertion has exactly the pre-provenance claims",
        async (_name, value) => {
            vi.stubEnv("ACR_OAUTH_ISSUER", value);
            const observed = installOps();
            installAcr(observed);

            await previewOAuthConsent({ handle: HANDLE, signal: signal() });
            await decideOAuthConsent({
                action: "approve",
                handle: HANDLE,
                repositoryScopes: ["full-chaos/platform"],
                signal: signal(),
            });
            await approveDeviceAuthorization({
                repositoryScopes: ["full-chaos/platform"],
                signal: signal(),
                userCode: "ABCD2345",
            });

            expect(observed.acrClaims).toHaveLength(4);
            for (const claims of observed.acrClaims) {
                expect(Object.keys(claims).sort()).toEqual(PRE_PROVENANCE_CLAIMS);
            }
            // The refusal's status read still runs while the claims are off.
            expect(observed.statusReads).toBe(3);
        },
    );

    it("Given ACR_OAUTH_ISSUER is set, when MCP consent runs, then the assertion has the pre-provenance claims plus sid and impersonating", async () => {
        const observed = installOps();
        installAcr(observed);

        await previewOAuthConsent({ handle: HANDLE, signal: signal() });

        expect(Object.keys(observed.acrClaims[0] ?? {}).sort()).toEqual(
            [...PRE_PROVENANCE_CLAIMS, "impersonating", "sid"].sort(),
        );
    });
});

describe("impersonation refusal by state", () => {
    const refusals = [
        ["previewOAuthConsent", () => previewOAuthConsent({ handle: HANDLE, signal: signal() })],
        [
            "decideOAuthConsent approve",
            () =>
                decideOAuthConsent({
                    action: "approve",
                    handle: HANDLE,
                    repositoryScopes: ["full-chaos/platform"],
                    signal: signal(),
                }),
        ],
        [
            "decideOAuthConsent deny",
            () => decideOAuthConsent({ action: "deny", handle: HANDLE, signal: signal() }),
        ],
        [
            "previewDeviceAuthorization",
            () => previewDeviceAuthorization({ signal: signal(), userCode: "ABCD2345" }),
        ],
        [
            "approveDeviceAuthorization",
            () =>
                approveDeviceAuthorization({
                    repositoryScopes: ["full-chaos/platform"],
                    signal: signal(),
                    userCode: "ABCD2345",
                }),
        ],
    ] as const;

    it.each(refusals)(
        "Given a same-org impersonation reported by the Ops status read, when %s, then it is refused and ACR is never called",
        async (_name, call) => {
            const observed = installOps({ impersonating: true });
            installAcr(observed);

            const error = await call().catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(AcrRuntimeError);
            expect(error).toMatchObject({ code: acrRuntimeErrorCodes.notEntitled, status: 403 });
            expect(observed.statusReads).toBe(1);
            expect(observed.acrClaims).toHaveLength(0);
        },
    );

    it.each(refusals)(
        "Given ACR_OAUTH_ISSUER is unset and a same-org impersonation, when %s, then it is still refused and ACR is never called",
        async (_name, call) => {
            vi.stubEnv("ACR_OAUTH_ISSUER", "");
            const observed = installOps({ impersonating: true });
            installAcr(observed);

            const error = await call().catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(AcrRuntimeError);
            expect(error).toMatchObject({ code: acrRuntimeErrorCodes.notEntitled, status: 403 });
            expect(observed.statusReads).toBe(1);
            expect(observed.acrClaims).toHaveLength(0);
        },
    );

    it("Given a same-org session flagged as impersonating, when the status read says no, then the consent is still refused", async () => {
        authenticate({ impersonated_org_id: "org-123", is_impersonating: true });
        const observed = installOps({ impersonating: false });
        installAcr(observed);

        await expect(
            previewOAuthConsent({ handle: HANDLE, signal: signal() }),
        ).rejects.toMatchObject({
            code: acrRuntimeErrorCodes.notEntitled,
        });
        expect(observed.acrClaims).toHaveLength(0);
    });

    it("Given an Ops token minted for an impersonation, when previewing, then the consent is refused", async () => {
        authenticate({}, { impersonating_user_id: "admin-1", sid: SERVER_SID });
        const observed = installOps({ impersonating: false });
        installAcr(observed);

        await expect(
            previewOAuthConsent({ handle: HANDLE, signal: signal() }),
        ).rejects.toMatchObject({
            code: acrRuntimeErrorCodes.notEntitled,
        });
        expect(observed.acrClaims).toHaveLength(0);
    });

    it("Given the Ops status read fails, when approving, then the consent fails closed and ACR is never called", async () => {
        const observed = installOps({ statusCode: 503 });
        installAcr(observed);

        await expect(
            decideOAuthConsent({
                action: "approve",
                handle: HANDLE,
                repositoryScopes: ["full-chaos/platform"],
                signal: signal(),
            }),
        ).rejects.toMatchObject({ code: acrRuntimeErrorCodes.unavailable, retryable: true });
        expect(observed.acrClaims).toHaveLength(0);
    });

    it("Given a same-org impersonation, when the consent page loads, then it renders the denied state", async () => {
        const observed = installOps({ impersonating: true });
        installAcr(observed);

        const element = (await OAuthAuthorizePage({
            searchParams: Promise.resolve({ handle: HANDLE }),
        })) as { props: Record<string, unknown> };

        expect(element.props).toMatchObject({ initialState: "denied" });
        expect(observed.acrClaims).toHaveLength(0);
    });
});

describe("first-party browser client", () => {
    it("Given the first-party browser client and a valid session, when the consent page loads, then it approves the live org scope server to server and redirects with no click", async () => {
        const observed = installOps();
        installAcr(observed, BROWSER_PREVIEW);

        await expect(
            OAuthAuthorizePage({ searchParams: Promise.resolve({ handle: HANDLE }) }),
        ).rejects.toThrow(`NEXT_REDIRECT:${BROWSER_REDIRECT}`);

        expect(observed.acrBodies).toEqual([
            { action: "preview", handle: HANDLE },
            { action: "approve", handle: HANDLE, repository_scopes: ["*"] },
        ]);
        const approve = observed.acrClaims.at(-1);
        expect(approve).toMatchObject({
            impersonating: false,
            permissions: ["credential:issue"],
            repository_scopes: ["*"],
            sid: SERVER_SID,
        });
    });

    it("Given the first-party browser client and a session with no sid, when the consent page loads, then nothing is approved", async () => {
        authenticate({}, {});
        const observed = installOps();
        installAcr(observed, BROWSER_PREVIEW);

        const element = (await OAuthAuthorizePage({
            searchParams: Promise.resolve({ handle: HANDLE }),
        })) as { props: Record<string, unknown> };

        expect(redirectMock).not.toHaveBeenCalled();
        expect(element.props.preview).toBeUndefined();
        expect(observed.acrBodies.filter((body) => body.action === "approve")).toHaveLength(0);
    });

    it("Given the first-party browser client, when the route is asked to approve with browser-chosen repositories, then it refuses and approves nothing", async () => {
        const observed = installOps();
        installAcr(observed, BROWSER_PREVIEW);

        const response = await consentRoute(
            routeRequest({
                action: "approve",
                handle: HANDLE,
                repository_scopes: ["full-chaos/platform"],
            }),
        );

        expect(response.status).toBe(400);
        expect(observed.acrBodies.filter((body) => body.action === "approve")).toHaveLength(0);
    });

    it.each([
        ["a redirect to another origin", { redirect_origin: "https://evil.example.test" }],
        ["the MCP resource", { resource: "https://mcp.example.test/mcp" }],
        ["a self-asserted client", { client_self_asserted: true }],
    ])(
        "Given %s, when the consent page loads, then the user sees the consent page",
        async (_name, change) => {
            const observed = installOps();
            installAcr(observed, { ...BROWSER_PREVIEW, ...change });

            const element = (await OAuthAuthorizePage({
                searchParams: Promise.resolve({ handle: HANDLE }),
            })) as { props: Record<string, unknown> };

            expect(redirectMock).not.toHaveBeenCalled();
            expect(element.props).toMatchObject({ handle: HANDLE });
            expect(element.props.preview).toBeDefined();
            expect(observed.acrBodies).toEqual([{ action: "preview", handle: HANDLE }]);
        },
    );

    it("Given ACR_OAUTH_ISSUER is unset, when the browser client's consent page loads, then the user sees the consent page", async () => {
        vi.stubEnv("ACR_OAUTH_ISSUER", "");
        const observed = installOps();
        installAcr(observed, BROWSER_PREVIEW);

        const element = (await OAuthAuthorizePage({
            searchParams: Promise.resolve({ handle: HANDLE }),
        })) as { props: Record<string, unknown> };

        expect(redirectMock).not.toHaveBeenCalled();
        expect(element.props.preview).toBeDefined();
    });
});

describe("third-party MCP client", () => {
    it("Given an MCP client, when the consent page loads, then the user sees the page with the preview and nothing is approved", async () => {
        const observed = installOps();
        installAcr(observed, MCP_PREVIEW);

        const element = (await OAuthAuthorizePage({
            searchParams: Promise.resolve({ handle: HANDLE }),
        })) as { props: Record<string, unknown> };

        expect(redirectMock).not.toHaveBeenCalled();
        expect(element.props).toMatchObject({
            handle: HANDLE,
            preview: expect.objectContaining({ clientName: "Claude Code" }),
        });
        expect(observed.acrBodies).toEqual([{ action: "preview", handle: HANDLE }]);
        expect(observed.acrClaims[0]).toMatchObject({ impersonating: false, sid: SERVER_SID });
    });

    it("Given an MCP client, when the route approves the chosen repositories, then ACR receives that repository grant", async () => {
        const observed = installOps();
        installAcr(observed, MCP_PREVIEW);

        const response = await consentRoute(
            routeRequest({
                action: "approve",
                handle: HANDLE,
                repository_scopes: ["full-chaos/platform"],
            }),
        );

        expect(response.status).toBe(200);
        expect(observed.acrBodies.at(-1)).toEqual({
            action: "approve",
            handle: HANDLE,
            repository_scopes: ["full-chaos/platform"],
        });
        expect(observed.acrClaims.at(-1)).toMatchObject({
            repository_scopes: ["full-chaos/platform"],
            sid: SERVER_SID,
        });
    });
});
