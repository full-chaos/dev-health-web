// CHAOS-13587: the approver reference the web server signs for the two approval calls. ACR checks
// it against the request assertion and forwards only it to the policy decision point.
import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/logger", () => ({
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
    APPROVER_REFERENCE_HEADER,
    approverReferenceWorstCaseLength,
    signApproverReference,
} from "../assertion";
import { AcrRuntimeClient } from "../client";
import {
    type AcrRuntimeConfig,
    loadAcrRuntimeConfig,
    resetApproverReferenceLengthCheck,
} from "../config";
import { approveDeviceAuthorization, previewDeviceAuthorization } from "../service";

const SID = "ses_fQw-UpG0T3qKYw5bnC1PEA";
const USER = "5e5510aa-6a1e-4c4e-9d3b-2b7f0c1a9e01";
const ORG = "3f9a1c77-2e4b-4d10-b5c8-6a7e9d0b1c23";

const pair = generateKeyPairSync("ed25519");
const unitConfig: AcrRuntimeConfig = {
    apiOrigin: new URL("https://acr.example.test"),
    audience: "acr-api",
    issuer: "https://www.fullchaos.dev",
    keyId: "web-2026-09",
    privateKey: pair.privateKey,
    timeoutMs: 5_000,
};

function decode(token: string): {
    header: Record<string, unknown>;
    claims: Record<string, unknown>;
} {
    const [header, claims, signature] = token.split(".");
    if (!header || !claims || !signature) throw new Error("malformed token");
    expect(
        verify(
            null,
            Buffer.from(`${header}.${claims}`),
            pair.publicKey,
            Buffer.from(signature, "base64url"),
        ),
    ).toBe(true);
    const json = (part: string) =>
        JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
    return { claims: json(claims), header: json(header) };
}

function sign(
    overrides: Partial<Parameters<typeof signApproverReference>[0]> = {},
): string | undefined {
    return signApproverReference({
        config: unitConfig,
        impersonating: false,
        now: 1_800_000_000,
        orgId: ORG,
        privateKey: pair.privateKey,
        requestAssertion: "request.assertion.value",
        sessionId: SID,
        subject: USER,
        ...overrides,
    });
}

describe("signApproverReference", () => {
    it("W1 signs the closed claim set for the decision point, bound to the request assertion bytes", () => {
        const token = sign();
        expect(token).toBeDefined();
        const { claims, header } = decode(token as string);
        expect(header).toEqual({ alg: "EdDSA", kid: "web-2026-09", typ: "web-approver+jwt" });
        expect(Object.keys(claims).sort()).toEqual([
            "action",
            "aud",
            "exp",
            "iat",
            "impersonating",
            "iss",
            "jti",
            "nbf",
            "org_id",
            "req",
            "sid",
            "sub",
        ]);
        expect(claims).toMatchObject({
            action: "acr.credential.issue",
            aud: "auth-service",
            exp: 1_800_000_030,
            iat: 1_800_000_000,
            impersonating: false,
            iss: "https://www.fullchaos.dev",
            nbf: 1_800_000_000,
            org_id: ORG,
            req: createHash("sha256").update("request.assertion.value", "utf8").digest("base64url"),
            sid: SID,
            sub: USER,
        });
    });

    it("W4 the prod-shaped reference is 683 characters, under the 1000 bound", () => {
        expect(sign()?.length).toBe(683);
        expect(approverReferenceWorstCaseLength(unitConfig)).toBeLessThanOrEqual(1_000);
    });

    it("W4 signs nothing over the bound or for a sid that is not a session.v1 id", () => {
        const long = {
            ...unitConfig,
            issuer: `https://${"i".repeat(180)}.test`,
            keyId: "k".repeat(128),
        };
        expect(sign({ config: long })).toBeUndefined();
        expect(sign({ sessionId: "not-a-session-id" })).toBeUndefined();
        expect(sign({ sessionId: `${SID}x` })).toBeUndefined();
    });
});

const server = setupServer(
    http.get("http://ops.example.test/api/v1/admin/impersonate/status", () =>
        HttpResponse.json({
            expires_at: null,
            is_impersonating: false,
            target_email: null,
            target_org_id: null,
            target_user_id: null,
        }),
    ),
    http.get("http://ops.example.test/api/v1/licensing/entitlements/:orgId", () =>
        HttpResponse.json({ features: { agent_context_runtime: true }, is_valid: true }),
    ),
);
const temporaryPaths: string[] = [];

function configure(issuer = "dev-health-web"): void {
    const keys = generateKeyPairSync("ed25519");
    const directory = mkdtempSync(join(tmpdir(), "acr-approver-"));
    temporaryPaths.push(directory);
    const keyFile = join(directory, "web-assertion.key");
    writeFileSync(keyFile, keys.privateKey.export({ format: "pem", type: "pkcs8" }));
    chmodSync(keyFile, 0o600);
    vi.stubEnv("ACR_API_ORIGIN", "https://acr.example.test");
    vi.stubEnv("ACR_REQUEST_TIMEOUT_MS", "5000");
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "acr-api");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", issuer);
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", keyFile);
    vi.stubEnv("ACR_WEB_ASSERTION_KID", "web-key-2026");
    vi.stubEnv("BACKEND_URL", "http://ops.example.test");
}

/** An Ops access token as the web server holds it: a JWT; `sid` only when given. */
function opsAccessToken(sid: string | undefined): string {
    const encode = (value: object) =>
        Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
    return `${encode({ alg: "EdDSA", kid: "kid-1", typ: "at+jwt" })}.${encode({
        aud: "dev-health-api",
        sub: "prn_XlUQqmoeTE6dOyt_DBqeAQ",
        ...(sid === undefined ? {} : { sid }),
    })}.c2lnbmF0dXJl`;
}

function authenticate(accessToken: string, user: Record<string, unknown> = {}): void {
    vi.mocked(auth).mockResolvedValue({
        access_token: accessToken,
        expires: "2026-07-16T00:00:00.000Z",
        user: { id: USER, org_id: ORG, real_org_id: ORG, ...user },
    });
}

type Seen = { assertion: string | null; reference: string | null; schema: unknown };

function captureAcr(): Seen[] {
    const seen: Seen[] = [];
    server.use(
        http.post("https://acr.example.test/api/v1/oauth/device_approval", async ({ request }) => {
            const body = (await request.json()) as { schema_version?: string };
            seen.push({
                assertion: request.headers.get("X-ACR-Web-Assertion"),
                reference: request.headers.get(APPROVER_REFERENCE_HEADER),
                schema: body.schema_version,
            });
            return body.schema_version === "device_approval_preview_request.v1"
                ? HttpResponse.json({
                      repository_hints: [],
                      schema_version: "device_approval_preview_response.v1",
                  })
                : HttpResponse.json({
                      schema_version: "device_approval_response.v1",
                      status: "approved",
                  });
        }),
    );
    return seen;
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => configure());
afterEach(() => {
    server.resetHandlers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    resetApproverReferenceLengthCheck();
    for (const temporaryPath of temporaryPaths.splice(0)) {
        rmSync(temporaryPath, { force: true, recursive: true });
    }
});

const approve = () =>
    approveDeviceAuthorization({
        repositoryScopes: ["*"],
        signal: new AbortController().signal,
        userCode: "ABCD2345",
    });

describe("the approval calls", () => {
    it("W2/W5 the approval sends a reference over the exact assertion it sends, with the token's sid", async () => {
        authenticate(opsAccessToken(SID));
        const seen = captureAcr();
        await expect(approve()).resolves.toEqual({ status: "approved" });
        expect(seen).toHaveLength(1);
        const { assertion, reference } = seen[0] as Seen;
        expect(assertion).not.toBeNull();
        expect(reference).not.toBeNull();
        const claims = JSON.parse(
            Buffer.from((reference as string).split(".")[1] as string, "base64url").toString(
                "utf8",
            ),
        ) as Record<string, unknown>;
        expect(claims["sid"]).toBe(SID);
        expect(claims["sub"]).toBe(USER);
        expect(claims["org_id"]).toBe(ORG);
        expect(claims["req"]).toBe(
            createHash("sha256")
                .update(assertion as string, "utf8")
                .digest("base64url"),
        );
    });

    it("W2 the sid does not wait for ACR_OAUTH_ISSUER: the assertion has none, the reference has it", async () => {
        vi.stubEnv("ACR_OAUTH_ISSUER", "");
        authenticate(opsAccessToken(SID));
        const seen = captureAcr();
        await approve();
        const assertionClaims = JSON.parse(
            Buffer.from(
                (seen[0]?.assertion as string).split(".")[1] as string,
                "base64url",
            ).toString("utf8"),
        ) as Record<string, unknown>;
        expect(assertionClaims["sid"]).toBeUndefined();
        expect(seen[0]?.reference).not.toBeNull();
    });

    it("W2 a session token with no sid sends no reference and says why", async () => {
        authenticate(opsAccessToken(undefined));
        const seen = captureAcr();
        await approve();
        expect(seen[0]?.reference).toBeNull();
        expect(logger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ module: "acr-approval", reason: "no_sid" }),
            "acr approval sent without an approver reference",
        );
    });

    it("W5 a preview sends no reference", async () => {
        authenticate(opsAccessToken(SID));
        const seen = captureAcr();
        await previewDeviceAuthorization({
            signal: new AbortController().signal,
            userCode: "ABCD2345",
        });
        expect(seen).toHaveLength(1);
        expect(seen[0]?.reference).toBeNull();
    });

    it("W5 the consent decision sends a reference; a read call never does", async () => {
        const references: (string | null)[] = [];
        server.use(
            http.post("https://acr.example.test/authorize/consent", ({ request }) => {
                references.push(request.headers.get(APPROVER_REFERENCE_HEADER));
                return HttpResponse.json({ redirect_url: "https://client.example.test/cb?code=x" });
            }),
            http.post(
                "https://acr.example.test/api/v1/agent-context/context-packets",
                ({ request }) => {
                    references.push(request.headers.get(APPROVER_REFERENCE_HEADER));
                    return HttpResponse.json({});
                },
            ),
        );
        const client = new AcrRuntimeClient(loadAcrRuntimeConfig());
        const authorization = {
            approverSessionId: SID,
            orgId: ORG,
            repositoryScopes: ["*"],
            subject: USER,
        };
        await client.oauthConsentDecide({
            authorization,
            body: "{}",
            signal: new AbortController().signal,
        });
        await client
            .contextPacket({ authorization, body: "{}", signal: new AbortController().signal })
            .catch(() => undefined);
        expect(references).toHaveLength(2);
        expect(references[0]).not.toBeNull();
        expect(references[1]).toBeNull();
    });

    it("W3 an impersonating session makes no ACR call and signs nothing", async () => {
        authenticate(opsAccessToken(SID), { is_impersonating: true });
        const seen = captureAcr();
        await expect(approve()).rejects.toMatchObject({ status: 403 });
        expect(seen).toHaveLength(0);
    });

    it("R1g a platform admin session with no organization makes no ACR call (401)", async () => {
        vi.mocked(auth).mockResolvedValue({
            access_token: opsAccessToken(SID),
            expires: "2026-07-16T00:00:00.000Z",
            user: { id: USER, is_superuser: true },
        });
        const seen = captureAcr();
        await expect(approve()).rejects.toMatchObject({ status: 401 });
        expect(seen).toHaveLength(0);
    });
});

describe("the reference length check", () => {
    it("C-5 one ERROR line when the configured issuer and kid can exceed the bound; the load still works", () => {
        configure(`https://${"i".repeat(180)}.test`);
        vi.stubEnv("ACR_WEB_ASSERTION_KID", "k".repeat(128));
        expect(() => loadAcrRuntimeConfig()).not.toThrow();
        loadAcrRuntimeConfig();
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ maxLength: 1_000, module: "acr-config" }),
            expect.stringContaining("approver reference"),
        );
    });

    it("C-5 no ERROR line for a prod-shaped config", () => {
        configure("https://www.fullchaos.dev");
        loadAcrRuntimeConfig();
        expect(logger.error).not.toHaveBeenCalled();
    });
});
