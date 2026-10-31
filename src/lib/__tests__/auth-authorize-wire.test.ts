import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-10876: the credentials provider reaches auth-service through the wire module, and the jwt
// callback takes expiry and session id from the issued access token.

const { nextAuthConfig } = vi.hoisted(() => ({ nextAuthConfig: { value: null as unknown } }));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-auth", () => ({
    default: vi.fn((config: unknown) => {
        nextAuthConfig.value = config;
        return {
            auth: vi.fn(),
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
vi.mock("@/lib/logger", () => {
    const l = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
    };
    l.child.mockReturnValue(l);
    return { logger: l };
});

import "@/lib/auth";
import Credentials from "next-auth/providers/credentials";

const b64u = (s: string) => Buffer.from(s).toString("base64url");
const SID = "ses_AAAAAAAAAAAAAAAAAAAAAQ";
const EXP = 1760000600;
const hs256 = (payload: Record<string, unknown> = { sid: SID, exp: EXP }) =>
    `${b64u('{"alg":"HS256","typ":"JWT"}')}.${b64u(JSON.stringify(payload))}.${b64u("sig")}`;

const user = {
    id: "u1",
    email: "a@example.test",
    org_id: "o1",
    role: "admin",
    is_superuser: false,
};
const body = (access: string) => ({
    access_token: access,
    refresh_token: "ref-1",
    expires_in: 3600,
    needs_onboarding: false,
    user,
});
const json = (status: number, b: unknown) =>
    new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

type Authorize = (credentials: Record<string, string>) => Promise<Record<string, unknown> | null>;
function authorize(): Authorize {
    const configs = vi.mocked(Credentials).mock.calls.map((c) => c[0] as { authorize?: unknown });
    const found = configs.find((c) => typeof c.authorize === "function")?.authorize;
    if (typeof found !== "function") throw new Error("authorize not captured");
    return found as Authorize;
}
type Jwt = (p: {
    token: Record<string, unknown>;
    user?: Record<string, unknown>;
}) => Promise<Record<string, unknown>>;
const jwt = (): Jwt => (nextAuthConfig.value as { callbacks: { jwt: Jwt } }).callbacks.jwt;
const creds = { email: "a@example.test", password: "pw" };
const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("credentials authorize", () => {
    it("returns the user with access_exp and sid read from the access token", async () => {
        fetchMock.mockResolvedValue(json(200, body(hs256())));
        expect(await authorize()(creds)).toMatchObject({
            id: "u1",
            email: "a@example.test",
            org_id: "o1",
            role: "admin",
            is_superuser: false,
            needs_onboarding: false,
            access_token: hs256(),
            refresh_token: "ref-1",
            expires_in: 3600,
            access_exp: EXP,
            sid: SID,
        });
    });

    it("returns no session_access_token field", async () => {
        fetchMock.mockResolvedValue(json(200, { ...body(hs256()), session_access_token: "svc" }));
        const got = await authorize()(creds);
        expect(JSON.stringify(got)).not.toContain("svc");
    });

    it("returns null for no email or no password, and calls no backend", async () => {
        expect(await authorize()({ email: "", password: "pw" })).toBeNull();
        expect(await authorize()({ email: "a@example.test", password: "" })).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns null on 401 and on an access token that does not decode", async () => {
        fetchMock.mockResolvedValueOnce(json(401, { detail: { message: "Invalid credentials" } }));
        expect(await authorize()(creds)).toBeNull();
        fetchMock.mockResolvedValueOnce(json(200, body("not-a-token")));
        expect(await authorize()(creds)).toBeNull();
    });

    it("throws account_locked on 429 with retry_after_seconds", async () => {
        fetchMock.mockResolvedValue(
            json(429, { detail: { message: "x", retry_after_seconds: 5 } }),
        );
        await expect(authorize()(creds)).rejects.toMatchObject({ code: "account_locked" });
    });

    it("throws rate_limited on 429 without retry_after_seconds", async () => {
        fetchMock.mockResolvedValue(json(429, { detail: { message: "x" } }));
        await expect(authorize()(creds)).rejects.toMatchObject({ code: "rate_limited" });
    });

    it("throws email_verification_required on the verification answer", async () => {
        fetchMock.mockResolvedValue(json(200, { status: "email_verification_required" }));
        await expect(authorize()(creds)).rejects.toMatchObject({
            code: "email_verification_required",
        });
    });

    it("throws auth_unavailable on 503, on a thrown call and on an unknown token class", async () => {
        fetchMock.mockResolvedValueOnce(json(503, {}));
        await expect(authorize()(creds)).rejects.toMatchObject({ code: "auth_unavailable" });
        fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
        await expect(authorize()(creds)).rejects.toMatchObject({ code: "auth_unavailable" });
        vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "nope");
        await expect(authorize()(creds)).rejects.toMatchObject({ code: "auth_unavailable" });
    });

    it("reads AUTH_ACCESS_TOKEN_CLASS and AUTH_TOKEN_ISSUER from the server environment", async () => {
        vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "eddsa");
        vi.stubEnv("AUTH_TOKEN_ISSUER", "");
        await expect(authorize()(creds)).rejects.toMatchObject({ code: "auth_unavailable" });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("jwt callback on login", () => {
    const loginUser = (over: Record<string, unknown> = {}) => ({
        id: "u1",
        org_id: "o1",
        role: "admin",
        is_superuser: false,
        needs_onboarding: false,
        access_token: hs256(),
        refresh_token: "ref-1",
        expires_in: 3600,
        access_exp: EXP,
        sid: SID,
        ...over,
    });

    it("sets expires_at from the token exp and stores sid", async () => {
        const exp = Math.floor(Date.now() / 1000) + 1800;
        const out = await jwt()({ token: {}, user: loginUser({ access_exp: exp }) });
        expect(out.expires_at).toBe(exp * 1000);
        expect(out.sid).toBe(SID);
    });

    it("falls back to expires_in when the token has no exp", async () => {
        const before = Date.now();
        const out = await jwt()({
            token: {},
            user: loginUser({ access_exp: undefined, sid: undefined }),
        });
        expect(out.expires_at as number).toBeGreaterThanOrEqual(before + 3600 * 1000);
        expect(out.expires_at as number).toBeLessThanOrEqual(Date.now() + 3600 * 1000);
        expect(out.sid).toBeUndefined();
    });
});
