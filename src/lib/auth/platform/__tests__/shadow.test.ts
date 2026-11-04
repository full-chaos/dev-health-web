import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    callbacks: [] as (() => Promise<unknown> | unknown)[],
    env: {} as Record<string, string | undefined>,
    transport: undefined as unknown,
    info: vi.fn(),
}));
vi.mock("next/server", () => ({
    after: (fn: () => Promise<unknown> | unknown) => {
        mocks.callbacks.push(fn);
    },
}));
vi.mock("@/lib/config", async (orig) => ({
    ...(await orig<typeof import("@/lib/config")>()),
    getServerEnv: () => mocks.env,
}));
vi.mock("@/lib/logger", () => ({ logger: { info: mocks.info } }));
vi.mock("@/lib/auth/shadow/config", async (orig) => ({
    ...(await orig<typeof import("@/lib/auth/shadow/config")>()),
    getShadowTransport: () => mocks.transport,
}));

import { MISMATCH_MESSAGE, RUN_MESSAGE } from "@/lib/auth/shadow/log";
import { ALLOW, DENY, TOKEN, recordingTransport } from "@/lib/auth/shadow/__tests__/helpers";
import { PLATFORM_ACTIONS, PLATFORM_SURFACES } from "../actionTable";
import { PLATFORM_SHADOW_ROWS, scheduleFnShadow, schedulePlatformShadow } from "../shadow";

let n = 0;
const session = (user: Record<string, unknown> = {}): Session => {
    n += 1;
    return {
        user: {
            id: `plat-user-${n}`,
            org_id: "org-1",
            role: "admin",
            is_superuser: true,
            is_impersonating: false,
            ...user,
        },
        access_token: TOKEN,
        expires: "2099-01-01",
    } as unknown as Session;
};
const impersonating = () => session({ is_impersonating: true });
const flush = async () => {
    await Promise.all(mocks.callbacks.map((fn) => fn()));
};
interface Wire {
    resource: { type: string; key: string };
    action: string;
}
const wire = (calls: { body: string }[]): Wire[] =>
    calls.flatMap((c) => (JSON.parse(c.body) as { requests: Wire[] }).requests);
const messages = () => mocks.info.mock.calls.map((c) => c[1] as string);
const mismatchLines = () =>
    mocks.info.mock.calls.filter((c) => c[1] === MISMATCH_MESSAGE).map((c) => c[0]);

const NAV = ["nav:platform", "nav:platform-billing"];
const ROW_IDS = PLATFORM_SHADOW_ROWS.map((r) => r.id);

beforeEach(() => {
    mocks.callbacks.length = 0;
    mocks.env = {};
    mocks.transport = undefined;
    mocks.info.mockReset();
});

describe("C3 switch off", () => {
    it.each([undefined, "", "off", "enforce", "SHADOW", " shadow"])(
        "makes no call and no log for AUTHZ_PLATFORM_UI=%j",
        async (value) => {
            const { transport, calls } = recordingTransport([ALLOW, ALLOW]);
            mocks.transport = transport;
            mocks.env = { AUTHZ_PLATFORM_UI: value, AUTHZ_SHADOW_NAV: undefined };
            for (const s of [session(), impersonating()]) {
                schedulePlatformShadow(s, ROW_IDS);
                scheduleFnShadow(s, "admin.orgs", false);
            }
            await flush();
            expect(calls).toHaveLength(0);
            expect(mocks.info).not.toHaveBeenCalled();
        },
    );

    it("does not turn on with the nav switch", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        mocks.transport = transport;
        mocks.env = { AUTHZ_SHADOW_NAV: "on" };
        schedulePlatformShadow(session(), ["nav:platform"]);
        await flush();
        expect(calls).toHaveLength(0);
    });
});

describe("C4 shadow", () => {
    beforeEach(() => {
        mocks.env = { AUTHZ_PLATFORM_UI: "shadow" };
    });

    it("asks the platform resource with the table action and logs a match without a mismatch line", async () => {
        const { transport, calls } = recordingTransport([ALLOW, ALLOW]);
        mocks.transport = transport;
        schedulePlatformShadow(session(), NAV);
        await flush();
        const items = wire(calls);
        expect(items.map((i) => i.action)).toEqual(["admin.stats", "admin.billing"]);
        expect(items.every((i) => i.resource.type === "platform")).toBe(true);
        expect(messages()).toEqual([RUN_MESSAGE]);
    });

    it("logs one mismatch per nav row when an impersonating session is denied", async () => {
        const { transport } = recordingTransport([DENY, DENY]);
        mocks.transport = transport;
        schedulePlatformShadow(impersonating(), NAV);
        await flush();
        expect(mismatchLines()).toHaveLength(2);
        expect(mismatchLines()[0]).toMatchObject({
            surface: "nav:platform",
            action: "admin.stats",
            client_allowed: true,
            decision_allowed: false,
        });
    });

    it("logs no mismatch for a page row an impersonating session is denied (parity with main)", async () => {
        const { transport } = recordingTransport([DENY]);
        mocks.transport = transport;
        schedulePlatformShadow(impersonating(), ["page:/superadmin/billing/plans"]);
        await flush();
        expect(mismatchLines()).toHaveLength(0);
    });

    it("C4d: an impersonating session with no act claim is never allowed by the client side", async () => {
        const { transport } = recordingTransport([ALLOW]);
        mocks.transport = transport;
        schedulePlatformShadow(impersonating(), ["page:/superadmin/billing/plans"]);
        await flush();
        expect(mismatchLines()).toHaveLength(1);
        expect(mismatchLines()[0]).toMatchObject({
            client_allowed: false,
            decision_allowed: true,
        });
        for (const id of ROW_IDS.filter((r) => r.startsWith("page:"))) {
            const row = PLATFORM_SHADOW_ROWS.find((r) => r.id === id);
            expect(
                row?.clientAllowed({ isPlatformAdmin: true, role: "admin", isImpersonating: true }),
            ).toBe(false);
        }
        for (const action of PLATFORM_ACTIONS) {
            mocks.callbacks.length = 0;
            mocks.info.mockReset();
            scheduleFnShadow(impersonating(), action, false);
            await flush();
            expect(
                mismatchLines().every(
                    (l) => (l as { client_allowed: boolean }).client_allowed === false,
                ),
            ).toBe(true);
        }
    });

    it("an fn row for stop/status is allowed by the client side while impersonating", async () => {
        const { transport } = recordingTransport([DENY]);
        mocks.transport = transport;
        scheduleFnShadow(impersonating(), "admin.impersonate", true);
        await flush();
        expect(mismatchLines()[0]).toMatchObject({ client_allowed: true, decision_allowed: false });
    });

    it("keeps the log fields closed: no token, no user id, no email", async () => {
        const { transport } = recordingTransport([DENY, DENY]);
        mocks.transport = transport;
        schedulePlatformShadow(impersonating(), NAV);
        await flush();
        const dump = JSON.stringify(mocks.info.mock.calls);
        expect(dump).not.toContain(TOKEN);
        expect(dump).not.toContain("plat-user-");
        expect(dump).not.toContain("org-1");
    });

    it("a throwing transport changes nothing and throws nowhere", async () => {
        mocks.transport = async () => {
            throw new Error("boom");
        };
        expect(() => schedulePlatformShadow(session(), NAV)).not.toThrow();
        await expect(flush()).resolves.toBeUndefined();
    });

    it("C4e: nav rows, a page row and an fn row of one render are one batch, asked once", async () => {
        const { transport, calls } = recordingTransport([ALLOW, ALLOW, ALLOW, ALLOW]);
        mocks.transport = transport;
        const s = session();
        schedulePlatformShadow(s, NAV);
        schedulePlatformShadow(s, ["page:/superadmin"]);
        scheduleFnShadow(s, "admin.stats", false);
        expect(mocks.callbacks).toHaveLength(1);
        await flush();
        expect(calls).toHaveLength(1);
        expect(wire(calls).map((i) => i.action)).toEqual([
            "admin.stats",
            "admin.billing",
            "admin.stats",
            "admin.stats",
        ]);
    });

    it("C4e: a later render opens a new batch (one sampling slot per user, org and surface set), another user never joins one", async () => {
        const { transport, calls } = recordingTransport([ALLOW, ALLOW, ALLOW]);
        mocks.transport = transport;
        const a = session();
        const b = session();
        schedulePlatformShadow(a, ["nav:platform"]);
        schedulePlatformShadow(b, ["nav:platform"]);
        expect(mocks.callbacks).toHaveLength(2);
        await flush();
        expect(calls).toHaveLength(2);
        mocks.callbacks.length = 0;
        schedulePlatformShadow(a, ["nav:platform-billing"]);
        expect(mocks.callbacks).toHaveLength(1);
        await flush();
        expect(calls).toHaveLength(3);
        mocks.callbacks.length = 0;
        schedulePlatformShadow(a, ["nav:platform"]);
        expect(mocks.callbacks).toHaveLength(1);
        await flush();
        expect(calls).toHaveLength(3);
    });

    it("C4c: one batch for all surfaces of one render, and one audit window per user and surfaces", async () => {
        const { transport, calls } = recordingTransport([ALLOW, ALLOW]);
        mocks.transport = transport;
        const s = session();
        schedulePlatformShadow(s, NAV);
        schedulePlatformShadow(s, NAV);
        await flush();
        expect(calls).toHaveLength(1);
        expect(wire(calls)).toHaveLength(2);
    });
});

describe("rows", () => {
    it("builds a row for each page, nav and control entry that has a platform action", () => {
        const want = PLATFORM_SURFACES.filter(
            (s) =>
                (s.kind === "page" || s.kind === "nav" || s.kind === "control") &&
                (PLATFORM_ACTIONS as readonly string[]).includes(s.action),
        ).map((s) => s.id);
        expect(ROW_IDS.sort()).toEqual(want.sort());
    });

    it("maps every row to its table action", () => {
        for (const row of PLATFORM_SHADOW_ROWS) {
            const t = PLATFORM_SURFACES.find((s) => s.id === row.id);
            expect(row.request).toEqual({ action: t?.action, resource: "platform" });
        }
    });
});
