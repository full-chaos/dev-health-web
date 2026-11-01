// CHAOS-12474 (ruling on the design amendment): `POST /api/ask-dev/authorize` runs ACR's
// `/authorize` from the signed-in session. No mock stands between the route and the wire: the real
// service, client and Ops reads run with the real `fetch` against a stub of ACR and Ops on a
// loopback port, so "no ACR call", "a redirect is not followed" and "over plain http" are observed
// on the wire. The stub answers on `ACR_API_ORIGIN`; the public issuer is another name, so a call
// that went to the issuer would not reach it.
import { generateKeyPairSync } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Every log call of the file: the no-code guard reads them all. */
const logs = vi.hoisted(() => [] as { level: string; args: unknown[] }[]);
vi.mock("@/lib/logger", () => {
    const level =
        (name: string) =>
        (...args: unknown[]) => {
            logs.push({ level: name, args });
        };
    const logger = {
        debug: level("debug"),
        info: level("info"),
        warn: level("warn"),
        error: level("error"),
        child: () => logger,
    };
    return { logger };
});
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { ACR_BROWSER_SCOPE, ACR_OAUTH_CALLBACK_PATH } from "@/lib/ask-dev/acr-browser-config";

import { POST } from "./route";

const WEB = "http://localhost:3000";
const ISSUER = "http://localhost:18081";
const CHALLENGE = "C".repeat(43);
const STATE = "S".repeat(43);
const HANDLE = "H".repeat(43);
const CODE = "acrcode_never_in_a_log_line";
const REDIRECT = `${WEB}${ACR_OAUTH_CALLBACK_PATH}?code=${CODE}&state=${STATE}&iss=${encodeURIComponent(ISSUER)}`;
const SID = "ses_AAAAAAAAAAAAAAAAAAAAAQ";

type Hit = {
    readonly method: string;
    readonly url: URL;
    readonly headers: IncomingMessage["headers"];
    readonly body: string;
};
type Answer = {
    readonly status: number;
    readonly headers?: Record<string, string>;
    readonly body?: unknown;
};

let server: Server;
let origin: string;
let hits: Hit[];
let keyDirectory: string;
/** What the stub answers for ACR's `/authorize`, its preview, its approve and Ops' status. */
let authorizeAnswer: () => Answer;
let previewAnswer: () => Answer;
let approveAnswer: () => Answer;
let statusAnswer: () => Answer;
let entitlementAnswer: () => Answer;

const location = (href: string): Answer => ({ status: 302, headers: { Location: href } });
const consentUrl = (handle = HANDLE) => `${WEB}/acr/authorize?handle=${handle}`;

function answer(response: ServerResponse, { status, headers, body }: Answer): void {
    response.writeHead(status, {
        "Content-Type": "application/json",
        ...headers,
    });
    response.end(body === undefined ? "" : JSON.stringify(body));
}

function route(hit: Hit): Answer {
    const { pathname } = hit.url;
    if (pathname === "/authorize") return authorizeAnswer();
    if (pathname === "/authorize/consent") {
        const { action } = JSON.parse(hit.body) as { action: string };
        return action === "preview" ? previewAnswer() : approveAnswer();
    }
    if (pathname === "/api/v1/admin/impersonate/status") return statusAnswer();
    if (pathname.startsWith("/api/v1/licensing/entitlements/")) return entitlementAnswer();
    return { status: 200, body: { reached: pathname } };
}

function opsToken(claims: Record<string, unknown>): string {
    const encode = (value: object) =>
        Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
    return `${encode({ alg: "HS256" })}.${encode({ sub: "user-123", ...claims })}.c2ln`;
}

function signIn(user: Record<string, unknown> = {}): void {
    vi.mocked(auth).mockResolvedValue({
        access_token: opsToken({ sid: SID }),
        expires: "2026-11-16T00:00:00.000Z",
        user: { id: "user-123", org_id: "org-123", real_org_id: "org-123", ...user },
    } as never);
}

function post(body: unknown = { code_challenge: CHALLENGE, state: STATE }, from = WEB): Request {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (from !== "") headers.Origin = from;
    return new Request(`${WEB}/api/ask-dev/authorize`, {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

const hitsOf = (pathname: string) => hits.filter((hit) => hit.url.pathname === pathname);
const authorizeHits = () => hitsOf("/authorize");
const consentActions = () =>
    hitsOf("/authorize/consent").map(
        (hit) => (JSON.parse(hit.body) as { action: string; handle: string }).action,
    );

beforeAll(async () => {
    server = createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
            const hit: Hit = {
                method: request.method ?? "",
                url: new URL(request.url ?? "/", "http://stub.invalid"),
                headers: request.headers,
                body: Buffer.concat(chunks).toString("utf8"),
            };
            hits.push(hit);
            answer(response, route(hit));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    keyDirectory = mkdtempSync(join(tmpdir(), "ask-dev-authorize-"));
    const keyFile = join(keyDirectory, "web-assertion.key");
    const pair = generateKeyPairSync("ed25519");
    writeFileSync(keyFile, pair.privateKey.export({ format: "pem", type: "pkcs8" }));
    chmodSync(keyFile, 0o600);
    vi.stubEnv("ACR_WEB_ASSERTION_KEY_FILE", keyFile);
});

afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise((resolve) => server.close(resolve));
    rmSync(keyDirectory, { force: true, recursive: true });
});

beforeEach(() => {
    hits = [];
    vi.stubEnv("ACR_API_ORIGIN", origin);
    vi.stubEnv("ACR_OAUTH_ISSUER", ISSUER);
    vi.stubEnv("ACR_REQUEST_TIMEOUT_MS", "5000");
    vi.stubEnv("ACR_WEB_ASSERTION_AUDIENCE", "dev-health-acr");
    vi.stubEnv("ACR_WEB_ASSERTION_ISSUER", "dev-health-web");
    vi.stubEnv("ACR_WEB_ASSERTION_KID", "web-key-2026");
    vi.stubEnv("AUTH_URL", WEB);
    vi.stubEnv("BACKEND_URL", origin);
    signIn();
    authorizeAnswer = () => location(consentUrl());
    previewAnswer = () => ({
        status: 200,
        body: {
            client_kind: "cimd",
            client_name: "Dev Health",
            client_self_asserted: false,
            expires_at: "2026-11-01T12:10:00Z",
            redirect_origin: WEB,
            resource: ISSUER,
            scopes: ["context:read", "evidence:read"],
        },
    });
    approveAnswer = () => ({ status: 200, body: { redirect_url: REDIRECT } });
    statusAnswer = () => ({ status: 200, body: { is_impersonating: false } });
    entitlementAnswer = () => ({
        status: 200,
        body: { features: { agent_context_runtime: true }, is_valid: true },
    });
});

afterEach(() => {
    vi.mocked(auth).mockReset();
});

describe("POST /api/ask-dev/authorize", () => {
    it("runs /authorize from the session and answers the code, state and iss", async () => {
        const response = await POST(post());
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({ code: CODE, state: STATE, iss: ISSUER });
        expect(consentActions()).toEqual(["preview", "approve"]);
    });

    it("sends ACR what the existing browser path sends, from its own config, over http", async () => {
        await POST(post());
        const [hit] = authorizeHits();
        expect(hit?.method).toBe("GET");
        expect(Object.fromEntries(hit?.url.searchParams ?? [])).toEqual({
            response_type: "code",
            client_id: "https://localhost/acr/dev-browser-client",
            redirect_uri: `${WEB}${ACR_OAUTH_CALLBACK_PATH}`,
            code_challenge: CHALLENGE,
            code_challenge_method: "S256",
            state: STATE,
            resource: ISSUER,
            scope: ACR_BROWSER_SCOPE,
        });
    });

    it("sends no cookie and no web credential to /authorize", async () => {
        await POST(post());
        const [hit] = authorizeHits();
        expect(hit?.headers.cookie).toBeUndefined();
        expect(hit?.headers.authorization).toBeUndefined();
        expect(hit?.headers["x-acr-web-assertion"]).toBeUndefined();
    });

    it("gives the handle from ACR's Location to the consent step, and no other", async () => {
        await POST(post());
        const consent = hitsOf("/authorize/consent").map(
            (hit) => (JSON.parse(hit.body) as { handle: string }).handle,
        );
        expect(consent).toEqual([HANDLE, HANDLE]);
    });

    it.each([
        ["another origin", "https://evil.example", 403],
        ["no origin", "", 403],
    ])("refuses %s before anything else", async (_, from, status) => {
        const response = await POST(post(undefined, from));
        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ error: { code: "origin_refused" } });
        expect(auth).not.toHaveBeenCalled();
        expect(hits).toEqual([]);
    });

    it.each([
        ["no session", null],
        ["a session with no token", { user: { id: "user-123", org_id: "org-123" } }],
        ["a session with no org", { access_token: "x", user: { id: "user-123" } }],
    ])("answers 401 for %s, with no ACR call", async (_, session) => {
        vi.mocked(auth).mockResolvedValue(session as never);
        const response = await POST(post());
        expect(response.status).toBe(401);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({ error: { code: "signed_out" } });
        expect(hits).toEqual([]);
    });

    it.each([
        ["the session's flag", { is_impersonating: true }, { is_impersonating: false }],
        ["another real org", { real_org_id: "org-admin" }, { is_impersonating: false }],
        ["Ops' fresh status read", {}, { is_impersonating: true }],
    ])("refuses an impersonating session by %s: no code, no ACR call", async (_, user, status) => {
        signIn(user);
        statusAnswer = () => ({ status: 200, body: status });
        const response = await POST(post());
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: { code: "impersonating" } });
        expect(authorizeHits()).toEqual([]);
        expect(consentActions()).toEqual([]);
    });

    it("fails closed when the impersonation status cannot be read: no ACR call", async () => {
        statusAnswer = () => ({ status: 500, body: {} });
        const response = await POST(post());
        expect(response.status).toBe(503);
        expect(authorizeHits()).toEqual([]);
    });

    it.each([
        ["not JSON", "{"],
        ["an array", [CHALLENGE, STATE]],
        ["null", "null"],
        ["no state", { code_challenge: CHALLENGE }],
        ["no challenge", { state: STATE }],
        ["a short state", { code_challenge: CHALLENGE, state: "short" }],
        ["a state with an equals sign", { code_challenge: CHALLENGE, state: `${"S".repeat(42)}=` }],
        ["a number", { code_challenge: 1, state: STATE }],
        ["the verifier", { code_challenge: CHALLENGE, state: STATE, code_verifier: "v" }],
        ["a client", { code_challenge: CHALLENGE, state: STATE, client_id: "x" }],
        ["a redirect", { code_challenge: CHALLENGE, state: STATE, redirect_uri: "x" }],
        ["a body too large", { code_challenge: CHALLENGE, state: STATE, pad: "x".repeat(2_048) }],
    ])("refuses %s: the shape is strict, with no ACR call", async (_, body) => {
        const response = await POST(post(body));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: { code: "invalid_request" } });
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(hits).toEqual([]);
    });

    it("is a named failure while the browser client is off, with no ACR call", async () => {
        vi.stubEnv("ACR_OAUTH_ISSUER", "");
        const response = await POST(post());
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: { code: "client_off" } });
        expect(hits).toEqual([]);
    });

    it("refuses an org with no Agent Context Runtime by name, and gives no code", async () => {
        entitlementAnswer = () => ({
            status: 200,
            body: { features: { agent_context_runtime: false }, is_valid: true },
        });
        const response = await POST(post());
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: { code: "not_entitled" } });
    });
});

describe("ACR's answer to /authorize", () => {
    it("never follows a refusal redirect: a 303 is a named failure", async () => {
        authorizeAnswer = () => ({
            status: 303,
            headers: { Location: `${origin}/refusal-target?error=invalid_scope&state=${STATE}` },
        });
        const response = await POST(post());
        expect(response.status).toBe(502);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({ error: { code: "acr_refused" } });
        expect(hitsOf("/refusal-target")).toEqual([]);
        expect(consentActions()).toEqual([]);
    });

    it("never follows a 302: the consent page is read, not visited", async () => {
        await POST(post());
        expect(hitsOf("/acr/authorize")).toEqual([]);
        authorizeAnswer = () => location(`${origin}/acr/authorize?handle=${HANDLE}`);
        await POST(post());
        expect(hitsOf("/acr/authorize")).toEqual([]);
    });

    it.each([
        ["another host", `https://evil.example/acr/authorize?handle=${HANDLE}`],
        ["web's name on another port", `http://localhost:3001/acr/authorize?handle=${HANDLE}`],
        ["another scheme", `https://localhost:3000/acr/authorize?handle=${HANDLE}`],
        ["another path", `${WEB}/acr/device?handle=${HANDLE}`],
        ["a longer path", `${WEB}/acr/authorize/x?handle=${HANDLE}`],
        ["user info", `http://x:y@localhost:3000/acr/authorize?handle=${HANDLE}`],
        ["a fragment", `${consentUrl()}#x`],
        ["a second parameter", `${consentUrl()}&state=${STATE}`],
        ["a repeated handle", `${consentUrl()}&handle=${HANDLE}`],
        ["no handle", `${WEB}/acr/authorize`],
        ["a short handle", consentUrl("short")],
        ["a long handle", consentUrl("H".repeat(44))],
        ["a relative URL", `/acr/authorize?handle=${HANDLE}`],
        ["no URL at all", "::"],
    ])("refuses a Location with %s, and never consents", async (_, href) => {
        authorizeAnswer = () => location(href);
        const response = await POST(post());
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: { code: "bad_location" } });
        expect(consentActions()).toEqual([]);
    });

    it("refuses a 302 with no Location", async () => {
        authorizeAnswer = () => ({ status: 302 });
        const response = await POST(post());
        expect(await response.json()).toEqual({ error: { code: "bad_location" } });
    });

    it("answers ACR's 429 by name, with its wait, after exactly one call", async () => {
        authorizeAnswer = () => ({
            status: 429,
            headers: { "Retry-After": "60" },
            body: { error: "slow_down" },
        });
        const response = await POST(post());
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("60");
        expect(await response.json()).toEqual({ error: { code: "rate_limited" } });
        expect(authorizeHits()).toHaveLength(1);
    });

    it.each([
        ["a 400 problem page", 400, "acr_refused", 502],
        ["a 200 page", 200, "acr_refused", 502],
        ["a 503 problem page", 503, "acr_unavailable", 503],
    ])("treats %s as a named failure", async (_, status, code, answered) => {
        authorizeAnswer = () => ({ status, body: "<html>problem</html>" });
        const response = await POST(post());
        expect(response.status).toBe(answered);
        expect(await response.json()).toEqual({ error: { code } });
        expect(consentActions()).toEqual([]);
    });

    it("answers a failed call as unavailable", async () => {
        vi.stubEnv("ACR_API_ORIGIN", "http://127.0.0.1:1");
        const response = await POST(post());
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: { code: "acr_unavailable" } });
    });
});

describe("the consent step", () => {
    it("is a loud failure when the first-party client reaches review", async () => {
        const { body } = previewAnswer();
        previewAnswer = () => ({
            status: 200,
            body: { ...(body as object), client_self_asserted: true },
        });
        const before = logs.length;
        const response = await POST(post());
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: { code: "consent_review" } });
        expect(consentActions()).toEqual(["preview"]);
        expect(logs.slice(before).some(({ level }) => level === "error")).toBe(true);
    });

    it.each([
        ["another host", `https://evil.example${ACR_OAUTH_CALLBACK_PATH}?code=c&state=s&iss=i`],
        ["another path", `${WEB}/dashboard?code=c&state=s&iss=i`],
        ["another port", `http://localhost:3001${ACR_OAUTH_CALLBACK_PATH}?code=c&state=s&iss=i`],
        ["no code", `${WEB}${ACR_OAUTH_CALLBACK_PATH}?state=s&iss=i`],
        ["no iss", `${WEB}${ACR_OAUTH_CALLBACK_PATH}?code=c&state=s`],
        ["an error", `${WEB}${ACR_OAUTH_CALLBACK_PATH}?error=access_denied&state=s&iss=i`],
        ["a fourth parameter", `${WEB}${ACR_OAUTH_CALLBACK_PATH}?code=c&state=s&iss=i&x=1`],
        ["an empty code", `${WEB}${ACR_OAUTH_CALLBACK_PATH}?code=&state=s&iss=i`],
        ["a fragment", `${WEB}${ACR_OAUTH_CALLBACK_PATH}?code=c&state=s&iss=i#x`],
    ])("refuses a redirect URL with %s, and returns no part of it", async (_, url) => {
        approveAnswer = () => ({ status: 200, body: { redirect_url: url } });
        const response = await POST(post());
        expect(response.status).toBe(502);
        expect(await response.text()).toBe(JSON.stringify({ error: { code: "bad_redirect" } }));
    });

    it.each([
        ["an expired handle", 410, "acr_refused", 502],
        ["a used handle", 409, "acr_refused", 502],
        ["ACR's limit on consent", 429, "rate_limited", 429],
        ["an outage", 503, "acr_unavailable", 503],
    ])("names %s", async (_, status, code, answered) => {
        approveAnswer = () => ({
            status,
            body: {
                schema_version: "error.v1",
                request_id: "req_1",
                error: {
                    code: "invalid_request",
                    message: "x",
                    http_status: status,
                    retryable: false,
                },
            },
        });
        const response = await POST(post());
        expect(response.status).toBe(answered);
        expect(await response.json()).toEqual({ error: { code } });
    });

    it("reads ACR's OAuth error body, which is no error.v1, as unavailable", async () => {
        approveAnswer = () => ({ status: 410, body: { error: "invalid_request" } });
        const response = await POST(post());
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: { code: "acr_unavailable" } });
    });

    it("gives no code to a session with no sid: ACR's approval needs it", async () => {
        vi.mocked(auth).mockResolvedValue({
            access_token: opsToken({}),
            expires: "2026-11-16T00:00:00.000Z",
            user: { id: "user-123", org_id: "org-123", real_org_id: "org-123" },
        } as never);
        const response = await POST(post());
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: { code: "acr_refused" } });
        expect(consentActions()).toEqual(["preview"]);
    });
});

describe("logs (CHAOS-12369)", () => {
    const SECRETS = [CODE, STATE, CHALLENGE, HANDLE, REDIRECT, ISSUER];

    it("no log call of this file holds a code, a state, a challenge, a handle or a URL", async () => {
        await POST(post());
        authorizeAnswer = () => location(`https://evil.example/?handle=${HANDLE}`);
        await POST(post());
        approveAnswer = () => ({ status: 200, body: { redirect_url: `${REDIRECT}&x=1` } });
        authorizeAnswer = () => location(consentUrl());
        await POST(post());
        // A guard that saw nothing proves nothing.
        expect(logs.length).toBeGreaterThan(3);
        for (const { args } of logs) {
            const line = JSON.stringify(args);
            for (const secret of SECRETS) expect(line).not.toContain(secret);
        }
    });

    it("says each request once, as an enum and a status", async () => {
        const before = logs.length;
        await POST(post());
        const lines = logs
            .slice(before)
            .filter(({ args }) => args[1] === "ask-dev authorize")
            .map(({ args }) => args[0]);
        expect(lines).toEqual([{ outcome: "authorized", status: 200 }]);
    });
});
