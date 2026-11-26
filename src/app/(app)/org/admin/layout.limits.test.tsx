import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/shadow", () => ({ scheduleShadow: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({
    getOrgEntitlements: vi.fn(async () => ({
        data: {
            org_id: "00000000-0000-4000-8000-0000000000b1",
            tier: "team",
            features: {},
            limits: { max_users: 20, max_repos: 10 },
        },
    })),
}));

import { useAdminTier } from "@/components/admin/AdminTierContext";
import AdminLayout from "./layout";

function Probe() {
    const { limits } = useAdminTier();
    return <p data-testid="max-repos">{String(limits.max_repos)}</p>;
}

beforeEach(() => {
    mocks.requireRole.mockReset();
    mocks.requireRole.mockResolvedValue({
        user: { id: "u", org_id: "00000000-0000-4000-8000-0000000000b1", is_superuser: false },
    });
});

describe("org admin layout hands the served entitlement limits to its pages", () => {
    it("a page under the layout reads limits.max_repos as served", async () => {
        render(await AdminLayout({ children: <Probe /> }));
        expect(screen.getByTestId("max-repos")).toHaveTextContent("10");
    });

    it("control: the served tier reaches the pages", async () => {
        function TierProbe() {
            return <p data-testid="tier">{useAdminTier().tier}</p>;
        }
        render(await AdminLayout({ children: <TierProbe /> }));
        expect(screen.getByTestId("tier")).toHaveTextContent("team");
    });
});
