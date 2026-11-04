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
vi.mock("../config", async (orig) => ({
    ...(await orig<typeof import("../config")>()),
    getShadowTransport: () => mocks.transport,
}));

import { MISMATCH_MESSAGE, RUN_MESSAGE } from "../log";
import { surfaceById, type Surface } from "../catalog";
import { scheduleShadow } from "../index";
import { shadowDecide, shadowViewerFrom, type ShadowInput } from "../run";
import { ALLOW, DENY, TOKEN, input, recordingTransport } from "./helpers";

const SERVICE_TOKEN = "svc-at-jwt-NOT-THE-PRINCIPAL";
let n = 0;
const session = (user: Record<string, unknown> = {}): Session => {
    n += 1;
    return {
        user: {
            id: `hooks-user-${n}`,
            org_id: "org-1",
            role: "admin",
            is_superuser: false,
            is_impersonating: false,
            ...user,
        },
        access_token: TOKEN,
        session_access_token: SERVICE_TOKEN,
        expires: "2099-01-01",
    } as unknown as Session;
};

const flush = async () => {
    await Promise.all(mocks.callbacks.map((fn) => fn()));
};

interface Wire {
    principal_reference: string;
    resource: { type: string };
    action: string;
}
const wire = (calls: { body: string }[]): Wire[] =>
    calls.flatMap((c) => (JSON.parse(c.body) as { requests: Wire[] }).requests);

const platformRow = (over: Partial<Surface> = {}): Surface => ({
    id: "platform:ui",
    clientAllowed: () => true,
    request: { action: "admin.users", resource: "platform" },
    ...over,
});

const infoMessages = () => mocks.info.mock.calls.map((c) => c[1] as string);

beforeEach(() => {
    vi.useRealTimers();
    mocks.callbacks.length = 0;
    mocks.env = {};
    mocks.transport = undefined;
    mocks.info.mockReset();
});

describe("H1 caller rows", () => {
    it("asks a caller platform row and logs its mismatch", async () => {
        const { transport, calls } = recordingTransport([DENY]);
        mocks.transport = transport;
        mocks.env = { AUTHZ_SHADOW_NAV: "on" };
        scheduleShadow(session(), ["platform:ui"], { surfaces: [platformRow()] });
        await flush();
        const items = wire(calls);
        expect(items).toHaveLength(1);
        expect(items[0]?.resource.type).toBe("platform");
        expect(items[0]?.action).toBe("admin.users");
        expect(infoMessages()).toContain(MISMATCH_MESSAGE);
        expect(mocks.info.mock.calls.find((c) => c[1] === MISMATCH_MESSAGE)?.[0]).toMatchObject({
            surface: "platform:ui",
            client_allowed: true,
            decision_allowed: false,
        });
    });

    it("shadowDecide resolves a caller row from the input", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        const given = { ...input({ surfaceIds: ["platform:ui"] }), surfaces: [platformRow()] };
        const r = await shadowDecide(given as ShadowInput, { transport, log: { info: vi.fn() } });
        expect(calls).toHaveLength(1);
        expect(r.status === "ran" && r.record.counts.match).toBe(1);
    });

    it("still drops an unknown id", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        const given = { ...input({ surfaceIds: ["nope"] }), surfaces: [platformRow()] };
        const r = await shadowDecide(given as ShadowInput, { transport, log: { info: vi.fn() } });
        expect(calls).toHaveLength(0);
        expect(r.status === "ran" && r.record.surfaces).toEqual([]);
    });

    it("leaves the closed table unchanged and still serves its ids", async () => {
        expect(surfaceById("platform:ui")).toBeUndefined();
        const { transport, calls } = recordingTransport([ALLOW]);
        const given = { ...input({ surfaceIds: ["guard:/org/admin"] }), surfaces: [platformRow()] };
        await shadowDecide(given as ShadowInput, { transport, log: { info: vi.fn() } });
        expect(wire(calls).map((w) => w.action)).toEqual(["integrations.read"]);
    });

    it("resolves an id from the caller rows before the closed table", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        const given = {
            ...input({ surfaceIds: ["guard:/org/admin"] }),
            surfaces: [platformRow({ id: "guard:/org/admin", request: null })],
        };
        const r = await shadowDecide(given as ShadowInput, { transport, log: { info: vi.fn() } });
        expect(calls).toHaveLength(0);
        expect(r.status === "ran" && r.record.counts.no_action).toBe(1);
    });
});

describe("H2 impersonating", () => {
    const impersonating = () => session({ is_impersonating: true });

    it("skips an impersonating session by default", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        mocks.transport = transport;
        mocks.env = { AUTHZ_SHADOW_NAV: "on" };
        scheduleShadow(impersonating(), ["guard:/org/admin"]);
        await flush();
        expect(calls).toHaveLength(0);
        expect(mocks.info).not.toHaveBeenCalled();
    });

    it("runs an impersonating session with includeImpersonating", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        mocks.transport = transport;
        mocks.env = { AUTHZ_SHADOW_NAV: "on" };
        scheduleShadow(impersonating(), ["guard:/org/admin"], { includeImpersonating: true });
        await flush();
        expect(calls).toHaveLength(1);
        expect(infoMessages()).toContain(RUN_MESSAGE);
    });

    it("sets isImpersonating on the viewer", () => {
        expect(shadowViewerFrom(impersonating()).isImpersonating).toBe(true);
        expect(shadowViewerFrom(session()).isImpersonating).toBe(false);
        expect(shadowViewerFrom(session({ is_impersonating: undefined })).isImpersonating).toBe(
            false,
        );
    });

    it("hands viewer.isImpersonating to clientAllowed", async () => {
        const { transport } = recordingTransport([ALLOW, ALLOW]);
        mocks.transport = transport;
        mocks.env = { AUTHZ_SHADOW_NAV: "on" };
        const seen: boolean[] = [];
        const row = platformRow({
            clientAllowed: (viewer) => {
                seen.push(viewer.isImpersonating);
                return true;
            },
        });
        scheduleShadow(impersonating(), ["platform:ui"], {
            surfaces: [row],
            includeImpersonating: true,
        });
        scheduleShadow(session(), ["platform:ui"], { surfaces: [row] });
        await flush();
        expect(seen.sort()).toEqual([false, true]);
    });

    it("sends the session access token as the principal reference", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        mocks.transport = transport;
        mocks.env = { AUTHZ_SHADOW_NAV: "on" };
        scheduleShadow(impersonating(), ["guard:/org/admin"], { includeImpersonating: true });
        await flush();
        const items = wire(calls);
        expect(items).toHaveLength(1);
        expect(items[0]?.principal_reference).toBe(TOKEN);
        expect(JSON.stringify(calls)).not.toContain(SERVICE_TOKEN);
    });
});

describe("H3 switch", () => {
    const ids = ["guard:/org/admin"];

    it("keeps the default switch AUTHZ_SHADOW_NAV = on", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        mocks.transport = transport;
        mocks.env = { AUTHZ_SHADOW_NAV: "on" };
        scheduleShadow(session(), ids);
        await flush();
        expect(calls).toHaveLength(1);
    });

    it.each([[undefined], [""], ["off"], ["shadow"], ["ON"]])(
        "keeps the default switch off for %j",
        async (value) => {
            const { transport, calls } = recordingTransport([ALLOW]);
            mocks.transport = transport;
            mocks.env = { AUTHZ_SHADOW_NAV: value };
            scheduleShadow(session(), ids);
            await flush();
            expect(calls).toHaveLength(0);
            expect(mocks.info).not.toHaveBeenCalled();
        },
    );

    it.each([[undefined], [""], ["off"], ["enforce"], ["SHADOW"], [" shadow"], ["on"]])(
        "a named switch is off for %j",
        async (value) => {
            const { transport, calls } = recordingTransport([ALLOW]);
            mocks.transport = transport;
            mocks.env = { LOG_LEVEL: value, AUTHZ_SHADOW_NAV: "on" };
            scheduleShadow(session(), ids, { switch: { name: "LOG_LEVEL", onValue: "shadow" } });
            await flush();
            expect(mocks.callbacks).toHaveLength(0);
            expect(calls).toHaveLength(0);
            expect(mocks.info).not.toHaveBeenCalled();
        },
    );

    it("a named switch is on for the exact value", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        mocks.transport = transport;
        mocks.env = { LOG_LEVEL: "shadow" };
        scheduleShadow(session(), ids, { switch: { name: "LOG_LEVEL", onValue: "shadow" } });
        await flush();
        expect(calls).toHaveLength(1);
        expect(infoMessages()).toContain(RUN_MESSAGE);
    });

    it("a named switch does not read the default switch", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        mocks.transport = transport;
        mocks.env = { LOG_LEVEL: "shadow", AUTHZ_SHADOW_NAV: "off" };
        scheduleShadow(session(), ids, { switch: { name: "LOG_LEVEL", onValue: "shadow" } });
        await flush();
        expect(calls).toHaveLength(1);
    });
});

describe("hooks keep the call contract", () => {
    it("schedules one after() per call with all hooks set", () => {
        const { transport } = recordingTransport([ALLOW]);
        mocks.transport = transport;
        mocks.env = { LOG_LEVEL: "shadow" };
        expect(
            scheduleShadow(session(), ["platform:ui"], {
                surfaces: [platformRow()],
                includeImpersonating: true,
                switch: { name: "LOG_LEVEL", onValue: "shadow" },
            }),
        ).toBeUndefined();
        expect(mocks.callbacks).toHaveLength(1);
    });

    it("makes no call without a transport", () => {
        mocks.env = { LOG_LEVEL: "shadow" };
        scheduleShadow(session(), ["platform:ui"], {
            surfaces: [platformRow()],
            switch: { name: "LOG_LEVEL", onValue: "shadow" },
        });
        expect(mocks.callbacks).toHaveLength(0);
    });
});
