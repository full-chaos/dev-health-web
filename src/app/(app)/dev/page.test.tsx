import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentOrgMock, getOrgEntitlementsMock } = vi.hoisted(() => ({
    getCurrentOrgMock: vi.fn(),
    getOrgEntitlementsMock: vi.fn(),
}));

vi.mock("@/components/ask-dev/AskDevWorkspace", () => ({ AskDevWorkspace: () => null }));
vi.mock("@/components/navigation/GlobalContextBar", () => ({ GlobalContextBar: () => null }));
vi.mock("@/components/navigation/PrimaryNav", () => ({ PrimaryNav: () => null }));
vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: getCurrentOrgMock,
    getOrgEntitlements: getOrgEntitlementsMock,
}));
vi.mock("@/lib/fetchOrNull", () => ({
    fetchOrNull: (request: Promise<unknown>) => request,
}));

import AskDevPage from "./page";

describe("Ask Dev entitlement boundary", () => {
    beforeEach(() => {
        getCurrentOrgMock.mockReset().mockResolvedValue({ data: { id: "org-1" } });
        getOrgEntitlementsMock.mockReset().mockResolvedValue({
            data: { features: { ask_dev: false }, is_valid: true },
        });
    });

    it("describes explicit organization and license enablement without implying a plan tier", async () => {
        render(await AskDevPage({ searchParams: Promise.resolve({}) }));

        expect(
            screen.getByText(
                "Ask Dev appears here only when it is explicitly enabled for this organization and its license.",
            ),
        ).toBeVisible();
        expect(screen.queryByText(/organization plan/i)).not.toBeInTheDocument();
    });
});
