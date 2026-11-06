import { beforeEach, describe, expect, it, vi } from "vitest";

// A start handoff is one-use: after it was used, or after the impersonation ended, a replay of it
// (still inside its 120 s life) never restores the delegated bearer, whatever the status read
// answers. Real jwt + session callbacks and the real seal; only fetch and next-auth are replaced.

const { nextAuthConfig } = vi.hoisted(() => ({ nextAuthConfig: { value: null as unknown } }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({
    headers: async () => new Headers(),
    cookies: async () => ({ get: () => undefined }),
}));
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
    CredentialsSignin: class extends Error {},
}));
vi.mock("next-auth/providers/credentials", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/github", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/gitlab", () => ({ default: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));

import { sealSessionHandoff } from "@/lib/auth";
import { resetImpersonationStatusForTests } from "@/lib/impersonationStatusMemo";

type Obj = Record<string, unknown>;
type Cb = {
    jwt: (p: Obj) => Promise<Obj>;
    session: (p: Obj) => Promise<{ access_token?: string; user: { is_impersonating?: boolean } }>;
};
const callbacks = () => (nextAuthConfig.value as { callbacks: Cb }).callbacks;

const ADMIN = "access-admin";
const DELEGATED = "access-delegated";
const NEXT_DELEGATED = "access-delegated-next";

type Mode =
    "true" | "false" | "503" | "429" | "network" | "missing" | "null" | "nonboolean" | "nonjson";
const FAILED: readonly Mode[] = [
    "503",
    "429",
    "network",
    "missing",
    "null",
    "nonboolean",
    "nonjson",
];
let status: Mode;

const json = (body: unknown, code = 200) =>
    new Response(JSON.stringify(body), {
        status: code,
        headers: { "content-type": "application/json" },
    });

beforeEach(() => {
    resetImpersonationStatusForTests();
    status = "503";
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            if (!String(input).endsWith("/api/v1/admin/impersonate/status")) {
                throw new Error(String(input));
            }
            if (status === "network") throw new TypeError("fetch failed");
            if (status === "nonjson") {
                return new Response("<html>gateway</html>", {
                    status: 200,
                    headers: { "content-type": "text/html" },
                });
            }
            if (status === "missing") return json({ target_user_id: "target-1" });
            if (status === "null") return json(null);
            if (status === "nonboolean") return json({ is_impersonating: "false" });
            if (status === "true") {
                return json({
                    is_impersonating: true,
                    target_user_id: "target-1",
                    target_org_id: "org-target",
                });
            }
            if (status === "false") return json({ is_impersonating: false });
            return json({ detail: "unavailable" }, Number(status));
        }),
    );
});

const adminToken = (): Obj => ({
    id: "admin-1",
    sub: "admin-1",
    is_superuser: true,
    access_token: ADMIN,
    expires_at: Date.now() + 3_600_000,
    last_validated: Date.now(),
});

const update = (token: Obj, sessionHandoff: string) =>
    callbacks().jwt({
        token,
        user: null,
        account: null,
        trigger: "update",
        session: { sessionHandoff },
    });

const start = (access_token = DELEGATED) =>
    sealSessionHandoff("impersonation", { access_token, expires_in: 600 }, "admin-1");
const end = (access_token = DELEGATED) =>
    sealSessionHandoff("impersonationEnd", { access_token }, "admin-1");

async function report(mode: Mode, replayed: Obj) {
    const session = await callbacks().session({ session: { user: {} }, token: replayed });
    console.log(
        `REPLAY status=${mode} imp=${String(replayed.imp_access_token === DELEGATED)} bearer=${String(session.access_token)} impersonating=${String(session.user.is_impersonating)}`,
    );
    return session;
}

function expectRefused(replayed: Obj, session: Awaited<ReturnType<Cb["session"]>>) {
    expect(replayed.imp_access_token).toBeUndefined();
    expect(replayed.imp_expires_at).toBeUndefined();
    expect(session.access_token).toBe(ADMIN);
    expect(session.user.is_impersonating).toBe(false);
}

describe("replay after a recorded stop", () => {
    it.each(FAILED)("status %s: refused", async (mode) => {
        const handoff = await start();
        const initial = await update(adminToken(), handoff);
        expect(initial.imp_access_token).toBe(DELEGATED);
        const stopped = await update(initial, await end());
        expect(stopped.imp_access_token).toBeUndefined();
        status = mode;
        resetImpersonationStatusForTests();
        const replayed = await update(stopped, handoff);
        expectRefused(replayed, await report(mode, replayed));
    });

    it("status true (a newer impersonation is live): the old start is refused", async () => {
        const handoff = await start();
        const stopped = await update(await update(adminToken(), handoff), await end());
        status = "true";
        resetImpersonationStatusForTests();
        const replayed = await update(stopped, handoff);
        expectRefused(replayed, await report("true", replayed));
    });
});

describe("replay after other ends", () => {
    it("after the status read said false: refused", async () => {
        const handoff = await start();
        const initial = await update(adminToken(), handoff);
        status = "false";
        resetImpersonationStatusForTests();
        const ended = await callbacks().jwt({
            token: initial,
            user: null,
            account: null,
            trigger: "update",
        });
        expect(ended.imp_access_token).toBeUndefined();
        status = "503";
        resetImpersonationStatusForTests();
        const replayed = await update(ended, handoff);
        expectRefused(
            replayed,
            await callbacks().session({ session: { user: {} }, token: replayed }),
        );
    });

    it("a start sealed before the end it never reached: refused", async () => {
        const first = await start();
        const unused = await start();
        const stopped = await update(await update(adminToken(), first), await end());
        const replayed = await update(stopped, unused);
        expectRefused(
            replayed,
            await callbacks().session({ session: { user: {} }, token: replayed }),
        );
    });
});

describe("controls", () => {
    it("a new start after the stop is admitted", async () => {
        const stopped = await update(await update(adminToken(), await start()), await end());
        // The next start is sealed later than the end (a click and a backend call apart).
        vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 1_000 });
        const next = await update(stopped, await start(NEXT_DELEGATED)).finally(() =>
            vi.useRealTimers(),
        );
        expect(next.imp_access_token).toBe(NEXT_DELEGATED);
        const session = await callbacks().session({ session: { user: {} }, token: next });
        expect(session.access_token).toBe(NEXT_DELEGATED);
        expect(session.user.is_impersonating).toBe(true);
    });

    it("a first start with a failed status read keeps the delegated token (D6720 S1)", async () => {
        const initial = await update(adminToken(), await start());
        expect(initial.imp_access_token).toBe(DELEGATED);
    });
});
