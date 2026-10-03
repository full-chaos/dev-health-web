import { beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-8466: the proxy, the page render and the route handlers are separate bundles; each loads its own
// copy of a module. These tests load the module twice (vi.resetModules) to stand for two bundles.

vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));
vi.mock("@/lib/logger", () => {
    const child = (): Record<string, unknown> => ({
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child,
    });
    return { logger: child() };
});

const fetchMock = vi.fn();

type Token = Record<string, unknown>;
const freshToken = (): Token => ({ id: "user-1", access_token: "access-token" });

async function loadCopy() {
    vi.resetModules();
    return await import("@/lib/authValidationMemo");
}

describe("processMemo", () => {
    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });

    it("two copies of the module get the SAME Map for one name, and different Maps for two names", async () => {
        vi.resetModules();
        const a = (await import("@/lib/processMemo")).processMemo<number>("t-same");
        vi.resetModules();
        const b = (await import("@/lib/processMemo")).processMemo<number>("t-same");
        const other = (await import("@/lib/processMemo")).processMemo<number>("t-other");
        a.set("k", 1);
        expect(b.get("k")).toBe(1);
        expect(b).toBe(a);
        expect(other).not.toBe(a);
    });

    it("a proxy copy and a route copy of the validation memo make ONE backend call for one token", async () => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ valid: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
        const proxy = await loadCopy();
        proxy.resetValidationMemoForTests();
        const route = await loadCopy();

        await proxy.applyBackendValidationMemo(freshToken() as never, Date.now());
        await route.applyBackendValidationMemo(freshToken() as never, Date.now());

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("the failure count grows across copies (a transient answer seen by one copy backs off the other)", async () => {
        fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
        const proxy = await loadCopy();
        proxy.resetValidationMemoForTests();
        const route = await loadCopy();
        const now = Date.now();

        const t1 = freshToken();
        await proxy.applyBackendValidationMemo(t1 as never, now);
        const t2 = freshToken();
        await route.applyBackendValidationMemo(t2 as never, now + 1);

        // The second copy reads the first copy's transient entry: it makes no call of its own.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(t2.validation_failures).toBe(t1.validation_failures);
    });

    it("both memos come from processMemo, not a module-level Map", async () => {
        const { readFileSync } = await import("node:fs");
        const read = (f: string) => readFileSync(`${process.cwd()}/src/lib/${f}`, "utf8");
        expect(read("authValidationMemo.ts")).toContain(
            'processMemo<ValidationMemoEntry>("authValidationMemo")',
        );
        expect(read("authValidationMemo.ts")).not.toMatch(/validationMemo = new Map/u);
        expect(read("auth.ts")).toContain('"impersonationStatusMemo"');
        expect(read("auth.ts")).not.toMatch(/impersonationStatusMemo = new Map/u);
    });
});
