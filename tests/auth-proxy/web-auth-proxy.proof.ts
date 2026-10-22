// Runs the REAL src/lib/auth.ts (Auth.js authorize + jwt callbacks) against a live go-api.
// Armed by ci/check_auth_web_proxy_*.sh in dev-health-ops, which sets AUTH_PROOF_BACKEND_URL,
// AUTH_PROOF_EMAIL and AUTH_PROOF_PASSWORD. Without them the suite fails: a proof that runs
// nothing must never pass.
import { describe, expect, it, vi } from "vitest";

const backend = process.env.AUTH_PROOF_BACKEND_URL ?? "";
const email = process.env.AUTH_PROOF_EMAIL ?? "";
const password = process.env.AUTH_PROOF_PASSWORD ?? "";

type Row = Record<string, unknown>;
interface Captured {
    config: null | {
        callbacks: { jwt: (args: { token: Row; user?: Row }) => Promise<Row> };
    };
    credentials: null | { authorize: (credentials: Row) => Promise<Row | null> };
}

const { captured } = vi.hoisted(() => ({
    captured: { config: null, credentials: null } as Captured,
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-auth", () => ({
    default: vi.fn((config: Captured["config"]) => {
        captured.config = config;
        return { auth: vi.fn(), handlers: {}, signIn: vi.fn(), signOut: vi.fn() };
    }),
    CredentialsSignin: class CredentialsSignin extends Error {
        code = "credentials";
    },
}));
vi.mock("next-auth/providers/credentials", () => ({
    default: vi.fn((options: Captured["credentials"]) => {
        captured.credentials = options;
        return options;
    }),
}));
vi.mock("next-auth/providers/github", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/gitlab", () => ({ default: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => process.env.AUTH_PROOF_BACKEND_URL ?? "" }));

import "@/lib/auth";

async function post(path: string, body: unknown): Promise<Response> {
    return fetch(`${backend}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("Web -> go-api -> auth-service", () => {
    it("is armed", () => {
        expect(backend).not.toBe("");
        expect(email).not.toBe("");
        expect(password).not.toBe("");
        expect(captured.credentials).not.toBeNull();
    });

    it("logs in, refreshes, and logs out", async () => {
        const user = await captured.credentials!.authorize({ email, password });
        expect(user, "Auth.js authorize() returned no user").toBeTruthy();
        expect(user.access_token).toBeTruthy();
        expect(user.refresh_token).toBeTruthy();

        const first = await captured.config!.callbacks.jwt({ token: {}, user });
        const loginRefresh = first.refresh_token as string;
        expect(loginRefresh).toBe(user.refresh_token);

        first.expires_at = Date.now() - 1;
        const refreshed = await captured.config!.callbacks.jwt({ token: { ...first } });
        expect(refreshed.error, "jwt() refresh set an error").toBeUndefined();
        expect(refreshed.access_token).toBeTruthy();
        expect(refreshed.refresh_token).toBeTruthy();
        expect(refreshed.refresh_token).not.toBe(loginRefresh);

        const logout = await post("/api/v1/auth/logout", {
            refresh_token: refreshed.refresh_token,
        });
        expect(logout.status).toBe(200);

        const after = await post("/api/v1/auth/refresh", {
            refresh_token: refreshed.refresh_token,
        });
        expect(after.status, "refresh after logout").toBe(401);
    });

    it("rejects a wrong password through authorize()", async () => {
        expect(backend).not.toBe("");
        const user = await captured.credentials!.authorize({
            email,
            password: `${password}-wrong`,
        });
        expect(user).toBeNull();
    });
});
