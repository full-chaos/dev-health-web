import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

const { authMock, contextPacketGatedBodySpy, getCurrentOrgMock, getOrgEntitlementsMock } =
    vi.hoisted(() => ({
        authMock: vi.fn(),
        contextPacketGatedBodySpy: vi.fn(),
        getCurrentOrgMock: vi.fn(),
        getOrgEntitlementsMock: vi.fn(),
    }));

vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: getCurrentOrgMock,
    getOrgEntitlements: getOrgEntitlementsMock,
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));

vi.mock("@/lib/fetchOrNull", () => ({
    fetchOrNull: async <T,>(result: Promise<T>) => result,
}));

vi.mock("@/components/navigation/PrimaryNav", () => ({
    PrimaryNav: () => null,
}));

vi.mock("@/components/shared/BackLink", () => ({
    BackLink: () => null,
}));

vi.mock("./_components/ContextPacketGatedBody", () => ({
    ContextPacketGatedBody: ({
        controlledState,
        enabled,
        live,
        showRetrievalDebug,
    }: {
        readonly controlledState: string;
        readonly enabled: boolean;
        readonly live: boolean;
        readonly showRetrievalDebug: boolean;
    }) => {
        contextPacketGatedBodySpy({ controlledState, enabled, live, showRetrievalDebug });
        return null;
    },
}));

import ContextPacketPage from "./page";

describe("ContextPacketPage entitlement gate", () => {
    beforeEach(() => {
        contextPacketGatedBodySpy.mockClear();
        getCurrentOrgMock.mockResolvedValue({ data: { id: "org-1" } });
        authMock.mockResolvedValue({ user: { is_superuser: false } });
        vi.stubEnv("DEV_HEALTH_TEST_MODE", "false");
        vi.stubEnv("NEXT_PUBLIC_DEV_HEALTH_TEST_MODE", "false");
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it.each([
        ["missing", {}],
        ["an entitlement error", { error: "unavailable" }],
        [
            "an invalid entitlement",
            { data: { features: { agent_context_runtime: true }, is_valid: false } },
        ],
        [
            "a disabled feature",
            { data: { features: { agent_context_runtime: false }, is_valid: true } },
        ],
    ])("keeps the direct route not entitled when it receives %s", async (_condition, result) => {
        getOrgEntitlementsMock.mockResolvedValue(result);

        render(await ContextPacketPage({}));

        expect(contextPacketGatedBodySpy).toHaveBeenCalledWith({
            controlledState: "sample",
            enabled: false,
            live: true,
            showRetrievalDebug: false,
        });
    });

    it("allows the direct route only for a valid enabled feature", async () => {
        getOrgEntitlementsMock.mockResolvedValue({
            data: { features: { agent_context_runtime: true }, is_valid: true },
        });

        render(await ContextPacketPage({}));

        expect(contextPacketGatedBodySpy).toHaveBeenCalledWith({
            controlledState: "sample",
            enabled: true,
            live: true,
            showRetrievalDebug: false,
        });
    });

    it("does not authorize the direct route from a public test-mode variable", async () => {
        vi.stubEnv("NEXT_PUBLIC_DEV_HEALTH_TEST_MODE", "true");
        getOrgEntitlementsMock.mockResolvedValue({
            data: { features: { agent_context_runtime: true }, is_valid: false },
        });

        render(await ContextPacketPage({}));

        expect(contextPacketGatedBodySpy).toHaveBeenCalledWith({
            controlledState: "sample",
            enabled: false,
            live: true,
            showRetrievalDebug: false,
        });
    });
});
