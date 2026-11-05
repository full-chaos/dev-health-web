import { generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-13105 cookie byte budget: the request Cookie line of a signed-in browser stays within
// 6144 bytes and the Set-Cookie lines of one answer within 16384 bytes, for every session shape
// (plain administrator, impersonating, impersonating with the administrator token near its end,
// and a kept impersonation whose delegated token expired). The cookie is the real sealed session
// JWT (next-auth `encode`, the session cookie salt), chunked as Auth.js chunks it, built from
// tokens of the size and shape auth-service mints (EdDSA, access-token.v1 claims).

const { nextAuthConfig, sessionRead } = vi.hoisted(() => ({
    nextAuthConfig: { value: null as unknown },
    sessionRead: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    redirect: vi.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
    }),
}));
vi.mock("next/headers", () => ({
    headers: async () => new Headers(),
    cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next-auth", () => ({
    default: vi.fn((config: unknown) => {
        nextAuthConfig.value = config;
        return {
            auth: sessionRead,
            handlers: { GET: vi.fn(), POST: vi.fn() },
            signIn: vi.fn(),
            signOut: vi.fn(),
        };
    }),
    CredentialsSignin: class CredentialsSignin extends Error {
        code = "credentials";
    },
}));
vi.mock("next-auth/providers/credentials", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/github", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/gitlab", () => ({ default: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));

import { encode } from "next-auth/jwt";
import { sealSessionHandoff } from "@/lib/auth";
import { resetImpersonationStatusForTests } from "@/lib/impersonationStatusMemo";

type Obj = Record<string, unknown>;
const callbacks = () =>
    (nextAuthConfig.value as { callbacks: { jwt: (p: Obj) => Promise<Obj> } }).callbacks;

const REQUEST_COOKIE_BUDGET = 6144;
const SET_COOKIE_BUDGET = 16384;

// Auth.js (@auth/core lib/utils/cookie.js): ALLOWED_COOKIE_SIZE 4096 - ESTIMATED_EMPTY_COOKIE_SIZE 160.
const CHUNK_SIZE = 4096 - 160;
const COOKIE = "__Secure-authjs.session-token";
const SECRET = "dev-secret-change-in-production";
const MAX_AGE = 30 * 24 * 60 * 60;
const OTHER_REQUEST_COOKIES = [
    `__Host-authjs.csrf-token=${randomBytes(32).toString("hex")}%7C${randomBytes(32).toString("hex")}`,
    "__Secure-authjs.callback-url=https%3A%2F%2Fapp.fullchaos.dev%2Fdashboard",
];

const { privateKey } = generateKeyPairSync("ed25519");
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const uuidBytes = (id: string) => Buffer.from(id.replace(/-/g, ""), "hex").toString("base64url");
const prn = (id: string) => `prn_${uuidBytes(id)}`;
const ses = (id: string) => `ses_${uuidBytes(id)}`;
const ISSUER = "https://auth.prod.fullchaos.dev";
const KID = `k_${randomBytes(16).toString("base64url")}`;

function eddsaToken(
    audience: string,
    scope: string,
    sub: string,
    sid: string,
    org: string,
    actor?: string,
): string {
    const now = Math.floor(Date.now() / 1000);
    const header = b64({ alg: "EdDSA", typ: "at+jwt", kid: KID });
    const payload = b64({
        iss: ISSUER,
        aud: audience,
        sub: prn(sub),
        principal_type: "human",
        sid: ses(sid),
        jti: randomUUID(),
        iat: now,
        nbf: now,
        exp: now + 900,
        org_id: org,
        ...(actor ? { act: { sub: prn(actor) } } : {}),
        scope,
    });
    const signature = sign(null, Buffer.from(`${header}.${payload}`), privateKey);
    return `${header}.${payload}.${signature.toString("base64url")}`;
}

const ADMIN_ID = randomUUID();
const ADMIN_ORG = randomUUID();
const ADMIN_SID = randomUUID();
const TARGET_ID = randomUUID();
const TARGET_ORG = randomUUID();
const DELEGATED_SID = randomUUID();
const API = ["dev-health-api", "api"] as const;
const SVC = ["auth-service", "auth:session"] as const;
const ADMIN_ACCESS = eddsaToken(...API, ADMIN_ID, ADMIN_SID, ADMIN_ORG);
const ADMIN_SERVICE = eddsaToken(...SVC, ADMIN_ID, ADMIN_SID, ADMIN_ORG);
const ADMIN_REFRESH = `rt_${randomBytes(32).toString("base64url")}`;
const DELEGATED_ACCESS = eddsaToken(...API, TARGET_ID, DELEGATED_SID, TARGET_ORG, ADMIN_ID);
const DELEGATED_SERVICE = eddsaToken(...SVC, TARGET_ID, DELEGATED_SID, TARGET_ORG, ADMIN_ID);

// Every permission go-api lists for an owner who holds the platform actions
// (dev-health-ops internal/api/session/permissions.go).
const OWNER_PERMISSIONS = [
    "admin:orgs",
    "admin:users",
    "analytics:export",
    "analytics:read",
    "git:read",
    "git:sync",
    "integrations:read",
    "integrations:write",
    "members:invite",
    "members:manage",
    "members:read",
    "metrics:compute",
    "metrics:read",
    "org:delete",
    "org:read",
    "org:write",
    "settings:read",
    "settings:write",
    "teams:read",
    "teams:write",
    "work_items:read",
    "work_items:sync",
];

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

beforeEach(() => {
    resetImpersonationStatusForTests();
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            const path = String(input);
            if (path.endsWith("/impersonate/status")) {
                return json({
                    is_impersonating: true,
                    target_user_id: TARGET_ID,
                    target_email: "a.rather.long.target.name@customer-example.test",
                    target_org_id: TARGET_ORG,
                });
            }
            if (path.endsWith("/impersonate/stop")) return json({ detail: "busy" }, 503);
            return json({ valid: true });
        }),
    );
});

function adminToken(): Obj {
    const now = Date.now();
    return {
        name: null,
        email: "platform.administrator@fullchaos.dev",
        sub: ADMIN_ID,
        id: ADMIN_ID,
        org_id: ADMIN_ORG,
        role: "owner",
        is_superuser: true,
        permissions: OWNER_PERMISSIONS,
        needs_onboarding: false,
        is_new_user: false,
        access_token: ADMIN_ACCESS,
        refresh_token: ADMIN_REFRESH,
        expires_at: now + 15 * 60_000,
        sid: ses(ADMIN_SID),
        session_access_token: ADMIN_SERVICE,
        session_expires_at: now + 15 * 60_000,
        act_sub: prn(ADMIN_ID),
        last_validated: now,
        refresh_failures: 0,
        validation_failures: 0,
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + MAX_AGE,
        jti: randomUUID(),
    };
}

async function impersonating(): Promise<Obj> {
    const sessionHandoff = await sealSessionHandoff(
        "impersonation",
        {
            access_token: DELEGATED_ACCESS,
            session_access_token: DELEGATED_SERVICE,
            expires_in: 900,
        },
        ADMIN_ID,
    );
    return callbacks().jwt({
        token: adminToken(),
        user: null,
        account: null,
        trigger: "update",
        session: { sessionHandoff },
    });
}

type Shape = "admin" | "impersonating" | "impersonating-near-expiry" | "kept-expired";

async function shape(name: Shape): Promise<Obj> {
    if (name === "admin") return adminToken();
    const token = await impersonating();
    const now = Date.now();
    if (name === "impersonating-near-expiry") return { ...token, expires_at: now + 4 * 60_000 };
    if (name === "kept-expired") {
        resetImpersonationStatusForTests();
        // The stop answers 503: the step keeps the delegated state with its expired token.
        return callbacks().jwt({
            token: { ...token, imp_expires_at: now - 1000 },
            user: null,
            account: null,
            trigger: "update",
        });
    }
    return token;
}

async function cookieBytes(token: Obj): Promise<{
    value: number;
    chunks: number;
    request: number;
    setCookie: number;
}> {
    const value = await encode({ token, secret: SECRET, salt: COOKIE, maxAge: MAX_AGE });
    const count = Math.ceil(value.length / CHUNK_SIZE);
    const parts =
        count === 1
            ? [{ name: COOKIE, value }]
            : Array.from({ length: count }, (_, i) => ({
                  name: `${COOKIE}.${i}`,
                  value: value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
              }));
    const expires = new Date(Date.now() + MAX_AGE * 1000).toUTCString();
    const setCookie = parts
        .map(
            (p) =>
                `${p.name}=${p.value}; Path=/; Expires=${expires}; HttpOnly; Secure; SameSite=Lax`,
        )
        .reduce((n, line) => n + Buffer.byteLength(`Set-Cookie: ${line}\r\n`), 0);
    const request = Buffer.byteLength(
        [...parts.map((p) => `${p.name}=${p.value}`), ...OTHER_REQUEST_COOKIES].join("; "),
    );
    return { value: value.length, chunks: count, request, setCookie };
}

describe("session cookie byte budget (CHAOS-13105)", () => {
    const SHAPES: Shape[] = ["admin", "impersonating", "impersonating-near-expiry", "kept-expired"];
    it.each(SHAPES)("%s", async (name) => {
        const token = await shape(name);
        if (name !== "admin") expect(token.is_impersonating).toBe(true);
        const bytes = await cookieBytes(token);
        console.info(
            `COOKIE-BUDGET shape=${name} jwe=${bytes.value} chunks=${bytes.chunks} ` +
                `request=${bytes.request}/${REQUEST_COOKIE_BUDGET} set_cookie=${bytes.setCookie}/${SET_COOKIE_BUDGET}`,
        );
        expect(bytes.request).toBeLessThanOrEqual(REQUEST_COOKIE_BUDGET);
        expect(bytes.setCookie).toBeLessThanOrEqual(SET_COOKIE_BUDGET);
    });
});
