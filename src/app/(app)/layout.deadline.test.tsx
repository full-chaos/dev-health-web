// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { track } from "@/test/stallFetch";

// CHAOS-9114: the app layout awaits the session and the entitlements before any page streams.
// Each wait is bounded: a stalled session read rejects with a TimeoutError (error boundary, no
// logout); stalled entitlements fall back to the existing "not valid" path and the layout renders.

const { warn, requireSession, getOrgEntitlements } = vi.hoisted(() => ({
    warn: vi.fn(),
    requireSession: vi.fn(),
    getOrgEntitlements: vi.fn(),
}));
vi.mock("@/lib/logger", () => {
    const l = { warn, info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: vi.fn() };
    l.child.mockReturnValue(l);
    return { logger: l };
});
vi.mock("@/lib/auth", () => ({ requireSession }));
vi.mock("@/lib/admin/server/billing", () => ({ getOrgEntitlements }));
vi.mock("sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/admin/AdminTabs", () => ({ AdminNavProvider: () => null }));
vi.mock("@/components/admin/AdminTierContext", () => ({ AdminTierProvider: () => null }));
vi.mock("@/components/admin/ImpersonationBanner", () => ({ ImpersonationBanner: () => null }));
vi.mock("@/components/auth/SessionProvider", () => ({ SessionProvider: () => null }));
vi.mock("@/components/billing/TrialBanner", () => ({ TrialBanner: () => null }));
vi.mock("@/components/evidence/EvidenceDrawerProvider", () => ({
    EvidenceDrawerProvider: () => null,
}));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/shell/AppShell", () => ({ AppShell: () => null }));
vi.mock("@/components/telemetry/TelemetryProvider", () => ({ TelemetryProvider: () => null }));
vi.mock("@/lib/graphql/provider", () => ({ GraphQLProvider: () => null }));

import { overrideDeadlinesForTests } from "@/lib/serverDeadline";
import AppLayout from "./layout";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const settle = async (state: { settled: boolean }) => {
    for (let i = 0; i < 1_500 && !state.settled; i += 1) await sleep(10);
};
const deadlineLines = () =>
    warn.mock.calls.filter(([, msg]) => msg === "server fetch deadline exceeded");

beforeEach(() => {
    warn.mockClear();
    overrideDeadlinesForTests({ auth: 40, read: 40, outerMargin: 60 });
});
afterEach(() => overrideDeadlinesForTests(null));

describe("(app) layout waits", () => {
    it("a session read that never settles rejects with a TimeoutError and names the step", async () => {
        requireSession.mockReturnValue(new Promise(() => {}));
        const state = track(AppLayout({ children: null }));
        await settle(state);
        expect(state.settled).toBe(true);
        expect((state.error as Error).name).toBe("TimeoutError");
        expect(deadlineLines()[0][0]).toMatchObject({ op: "step layout session" });
        expect(getOrgEntitlements).not.toHaveBeenCalled();
    });

    it("entitlements that never settle: the layout still renders, the step is named", async () => {
        requireSession.mockResolvedValue({ user: { org_id: "org-1" } });
        getOrgEntitlements.mockReturnValue(new Promise(() => {}));
        const state = track(AppLayout({ children: null }));
        await settle(state);
        expect(state.settled).toBe(true);
        expect(state.error).toBeUndefined();
        expect(state.value).toBeTruthy();
        expect(deadlineLines()[0][0]).toMatchObject({ op: "step layout entitlements" });
    });
});
