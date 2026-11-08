import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), scheduleShadow: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/shadow", () => ({ scheduleShadow: mocks.scheduleShadow }));
vi.mock("@/lib/admin/server", () => ({
    getOrgEntitlements: vi.fn(async () => ({ data: { tier: "community", features: {} } })),
}));

import DataHealthLayout from "./layout";

describe("data-health layout keeps its guard (shadow is advisory)", () => {
    beforeEach(() => {
        mocks.requireRole.mockReset();
        mocks.scheduleShadow.mockReset();
    });

    it("still refuses when the guard redirects, and the shadow never runs", async () => {
        mocks.requireRole.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
        await expect(DataHealthLayout({ children: <p>x</p> })).rejects.toThrow("NEXT_REDIRECT");
        expect(mocks.scheduleShadow).not.toHaveBeenCalled();
    });

    it("renders for an allowed role and schedules the shadow for its surface", async () => {
        const session = { user: { id: "u", org_id: "org-1", role: "operator" } };
        mocks.requireRole.mockResolvedValueOnce(session);
        await expect(DataHealthLayout({ children: <p>x</p> })).resolves.toBeTruthy();
        expect(mocks.requireRole).toHaveBeenCalledWith(
            ["admin", "owner", "operator"],
            "/data-health",
        );
        expect(mocks.scheduleShadow).toHaveBeenCalledWith(session, ["guard:/data-health"]);
    });
});
