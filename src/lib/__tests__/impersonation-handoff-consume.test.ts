import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeHandoffConsume, type ConsumeMode } from "@/test/handoffConsume";

// A start handoff is admitted only when go-api consumes its one-use record (CHAOS-13184). The record
// lives in go-api, so a new JWT (a re-login, another tab) cannot admit the handoff again, and no
// confirm is no admit. Real jwt + session callbacks and the real seal; only fetch and next-auth are
// replaced.

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
import { endImpersonationForSignOut } from "@/lib/impersonationToken";
import { resetImpersonationStatusForTests } from "@/lib/impersonationStatusMemo";

type Obj = Record<string, unknown>;
type Session = { access_token?: string; error?: string; user: { is_impersonating?: boolean } };
type Cb = { jwt: (p: Obj) => Promise<Obj>; session: (p: Obj) => Promise<Session> };
const callbacks = () => (nextAuthConfig.value as { callbacks: Cb }).callbacks;

const ADMIN = "access-admin";
const DELEGATED = "access-delegated";
type Status = "503" | "true" | "false";
let status: Status;
let ops: ReturnType<typeof fakeHandoffConsume>;

const json = (body: unknown, code = 200) =>
    new Response(JSON.stringify(body), {
        status: code,
        headers: { "content-type": "application/json" },
    });

beforeEach(() => {
    resetImpersonationStatusForTests();
    status = "503";
    ops = fakeHandoffConsume();
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (ops.handles(input)) return ops.answer(init);
            if (url.endsWith("/api/v1/admin/impersonate/stop")) return json({ status: "stopped" });
            if (!url.endsWith("/api/v1/admin/impersonate/status")) throw new Error(url);
            if (status === "503") return json({ detail: "unavailable" }, 503);
            if (status === "false") return json({ is_impersonating: false });
            return json({
                is_impersonating: true,
                target_user_id: "target-1",
                target_org_id: "org-target",
            });
        }),
    );
});

const adminToken = (): Obj => ({
    id: "admin-1",
    sub: "admin-1",
    is_superuser: true,
    access_token: ADMIN,
    refresh_token: "refresh-admin",
    expires_at: Date.now() + 3_600_000,
    last_validated: Date.now(),
});

const update = (token: Obj, handoff?: string) =>
    callbacks().jwt({
        token,
        user: null,
        account: null,
        trigger: "update",
        session: handoff ? { sessionHandoff: handoff } : {},
    });

const start = (handoff_id = ops.issue(), user = "admin-1") =>
    sealSessionHandoff(
        "impersonation",
        { access_token: DELEGATED, expires_in: 600, handoff_id },
        user,
    );
const end = () => sealSessionHandoff("impersonationEnd", { access_token: DELEGATED }, "admin-1");

const freshLogin = () =>
    callbacks().jwt({
        token: {},
        user: {
            id: "admin-1",
            org_id: "org-admin",
            role: "admin",
            is_superuser: true,
            access_token: ADMIN,
            refresh_token: "refresh-admin",
            expires_in: 3600,
        },
        account: null,
    });

const session = (token: Obj) => callbacks().session({ session: { user: {} }, token });

async function expectRefused(token: Obj) {
    const s = await session(token);
    expect(token.imp_access_token).toBeUndefined();
    expect(s.access_token).toBe(ADMIN);
    expect(s.user.is_impersonating).toBe(false);
    return s;
}

async function expectAdmitted(token: Obj) {
    const s = await session(token);
    expect(token.imp_access_token).toBe(DELEGATED);
    expect(s.access_token).toBe(DELEGATED);
    expect(s.user.is_impersonating).toBe(true);
}

describe("W1/W6 a replay after a re-login is refused by go-api's record", () => {
    const endings = ["end handoff", "status false", "stop step", "sign-out drop"] as const;
    const cells = endings.flatMap((ending) =>
        (["503", "true"] as const).map((replayStatus) => [ending, replayStatus] as const),
    );
    it.each(cells)(
        "%s, then a same-user sign-in, replay status %s",
        async (ending, replayStatus) => {
            const handoff = await start();
            const token = await update(adminToken(), handoff);
            await expectAdmitted(token);
            if (ending === "end handoff") {
                await update(token, await end());
            } else if (ending === "status false") {
                status = "false";
                await update(token);
            } else if (ending === "stop step") {
                token.imp_expires_at = Date.now() - 1;
                await update(token);
            } else {
                await endImpersonationForSignOut(token as never, Date.now());
            }
            const loggedIn = await freshLogin();
            expect(loggedIn.imp_handoff_floor).toBeUndefined();
            status = replayStatus;
            resetImpersonationStatusForTests();
            const replayed = await update(loggedIn, handoff);
            const s = await expectRefused(replayed);
            console.log(
                `RELOGIN_REPLAY end=${ending} status=${replayStatus} imp=${String(replayed.imp_access_token === DELEGATED)} bearer=${String(s.access_token)} impersonating=${String(s.user.is_impersonating)}`,
            );
            expect(ops.calls()).toHaveLength(2);
        },
    );
});

describe("W2 two updates with one handoff from two copies of the session", () => {
    it("exactly one admits", async () => {
        const handoff = await start();
        const [a, b] = await Promise.all([
            update(adminToken(), handoff),
            update(adminToken(), handoff),
        ]);
        const admitted = [a, b].filter((t) => t.imp_access_token === DELEGATED);
        expect(admitted).toHaveLength(1);
        expect(ops.calls()).toHaveLength(2);
    });
});

describe("W3 no confirm from go-api is no admit, and the update answers 503", () => {
    it.each(["503", "500", "401", "network", "unexpected"] as ConsumeMode[])(
        "consume %s: refused, one-shot error, no floor fallback",
        async (mode) => {
            ops.setMode(mode);
            const updated = await update(adminToken(), await start());
            const s = await session(updated);
            expect(updated.imp_access_token).toBeUndefined();
            expect(s.user.is_impersonating).toBe(false);
            expect(s.error).toBe("impersonation_handoff_unconfirmed");
            expect(updated.imp_handoff_floor).toBeUndefined();
            // The next read drops the one-shot error; the session is the administrator's.
            ops.setMode("ok");
            const next = await callbacks().jwt({
                token: updated,
                user: null,
                account: null,
                trigger: undefined,
            });
            expect(next.error).toBeUndefined();
            expect((await session(next)).access_token).toBe(ADMIN);
        },
    );

    it("no administrator bearer: refused without a call", async () => {
        const token = adminToken();
        token.access_token = undefined;
        const updated = await update(token, await start());
        expect(updated.imp_access_token).toBeUndefined();
        expect(ops.calls()).toHaveLength(0);
    });
});

describe("W4 an expired handoff or record is refused", () => {
    it("a record that is gone (life ran out, eviction): refused", async () => {
        const id = ops.issue();
        ops.drop(id);
        await expectRefused(await update(adminToken(), await start(id)));
    });

    it("a handoff past its 120 s life and the 15 s clock tolerance: refused at open, go-api is not asked", async () => {
        const handoff = await start();
        vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 140_000 });
        try {
            await expectRefused(await update(adminToken(), handoff));
        } finally {
            vi.useRealTimers();
        }
        expect(ops.calls()).toHaveLength(0);
    });
});

describe("W5 another user's handoff is refused", () => {
    it("sealed for another user: refused at open, go-api is not asked", async () => {
        await expectRefused(await update(adminToken(), await start(ops.issue(), "admin-2")));
        expect(ops.calls()).toHaveLength(0);
    });

    it("a record of another administrator: go-api refuses", async () => {
        await expectRefused(await update(adminToken(), await start(ops.issue("access-other"))));
        expect(ops.calls()).toHaveLength(1);
    });

    it("a start handoff without a handoff id: refused at open", async () => {
        const handoff = await sealSessionHandoff(
            "impersonation",
            { access_token: DELEGATED, expires_in: 600 },
            "admin-1",
        );
        const s = await expectRefused(await update(adminToken(), handoff));
        expect(s.error).toBeUndefined();
        expect(ops.calls()).toHaveLength(0);
    });
});

describe("controls", () => {
    it("a confirmed start is admitted once, with the record consumed", async () => {
        const token = await update(adminToken(), await start());
        await expectAdmitted(token);
        expect(ops.calls()).toHaveLength(1);
    });

    it("the JWT floor still refuses a replay on the same session without asking go-api", async () => {
        const handoff = await start();
        const token = await update(adminToken(), handoff);
        const replayed = await update(token, handoff);
        expect(replayed.imp_access_token).toBe(DELEGATED);
        expect(ops.calls()).toHaveLength(1);
    });
});
