import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-10877 (D6131): every social provider is built with PKCE S256 and a state check, pinned in
// auth.ts. W-3 reads the options the providers are built with; W-4 runs the real Auth.js sign-in
// and reads the redirect it answers.

type Options = Record<string, unknown>;
const { built, nextAuthConfig } = vi.hoisted(() => ({
    built: {} as Record<string, Options>,
    nextAuthConfig: { value: null as unknown },
}));

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

const PROVIDERS = ["github", "google", "gitlab"] as const;

function setSocialEnv() {
    for (const p of PROVIDERS) {
        vi.stubEnv(`AUTH_${p.toUpperCase()}_ID`, `${p}-client-id`);
        vi.stubEnv(`AUTH_${p.toUpperCase()}_SECRET`, `${p}-client-secret`);
    }
}

beforeEach(() => {
    vi.resetModules();
    nextAuthConfig.value = null;
    for (const k of Object.keys(built)) delete built[k];
    setSocialEnv();
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("W-3 social provider options", () => {
    beforeEach(() => {
        for (const p of PROVIDERS) {
            vi.doMock(`next-auth/providers/${p}`, () => ({
                default: (options: Options) => {
                    built[p] = options;
                    return { id: p, ...options };
                },
            }));
        }
    });
    afterEach(() => {
        for (const p of PROVIDERS) vi.doUnmock(`next-auth/providers/${p}`);
    });

    it.each(PROVIDERS)("%s is built with checks pkce and state", async (p) => {
        await import("@/lib/auth");
        expect(built[p]).toBeDefined();
        expect(built[p].checks).toEqual(["pkce", "state"]);
    });
});

const GOOGLE_AUTHORIZE = "https://accounts.google.example/o/oauth2/v2/auth";

function stubGoogleDiscovery() {
    const real = globalThis.fetch;
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input instanceof Request ? input.url : input);
            if (url.includes("accounts.google.com/.well-known/openid-configuration")) {
                return new Response(
                    JSON.stringify({
                        issuer: "https://accounts.google.com",
                        authorization_endpoint: GOOGLE_AUTHORIZE,
                        token_endpoint: "https://oauth2.google.example/token",
                        userinfo_endpoint: "https://openidconnect.google.example/v1/userinfo",
                        jwks_uri: "https://www.google.example/oauth2/v3/certs",
                        code_challenge_methods_supported: ["S256", "plain"],
                    }),
                    { status: 200, headers: { "content-type": "application/json" } },
                );
            }
            return real(input, init);
        }),
    );
}

describe("W-4 the real sign-in redirect", () => {
    it.each(PROVIDERS)("%s redirects with an S256 code challenge and a state", async (p) => {
        stubGoogleDiscovery();
        await import("@/lib/auth");
        const real = await vi.importActual<typeof import("next-auth")>("next-auth");
        const { handlers } = real.default(nextAuthConfig.value as never);
        const csrf = await handlers.GET(new Request("http://app.test/api/auth/csrf"));
        const csrfToken = ((await csrf.json()) as { csrfToken: string }).csrfToken;
        const csrfCookie = csrf.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; ");
        const response = await handlers.POST(
            new Request(`http://app.test/api/auth/signin/${p}`, {
                method: "POST",
                headers: {
                    "content-type": "application/x-www-form-urlencoded",
                    cookie: csrfCookie,
                },
                body: new URLSearchParams({ csrfToken, callbackUrl: "http://app.test/" }),
            }),
        );
        expect(response.status).toBe(302);
        const location = new URL(response.headers.get("location") ?? "");
        expect(location.searchParams.get("code_challenge_method")).toBe("S256");
        expect(location.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(location.searchParams.get("state")).toBeTruthy();
        expect(location.searchParams.get("client_id")).toBe(`${p}-client-id`);
        const cookies = response.headers.getSetCookie().join(";");
        expect(cookies).toContain("pkce.code_verifier");
        expect(cookies).toContain("state=");
    });
});
