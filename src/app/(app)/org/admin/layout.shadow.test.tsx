import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), scheduleShadow: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/auth/shadow", () => ({ scheduleShadow: mocks.scheduleShadow }));
vi.mock("@/lib/admin/server", () => ({
    getOrgEntitlements: vi.fn(async () => ({ data: { tier: "community", features: {} } })),
}));

import AdminLayout from "./layout";

const session = { user: { id: "u", org_id: "org-1", role: "admin", is_superuser: false } };

describe("org admin layout keeps its guard (shadow is advisory)", () => {
    beforeEach(() => {
        mocks.requireRole.mockReset();
        mocks.scheduleShadow.mockReset();
    });

    it("still refuses when the guard redirects, and the shadow never runs", async () => {
        mocks.requireRole.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
        await expect(AdminLayout({ children: <p>x</p> })).rejects.toThrow("NEXT_REDIRECT");
        expect(mocks.scheduleShadow).not.toHaveBeenCalled();
    });

    it("renders for an allowed role and schedules the shadow for its surface", async () => {
        mocks.requireRole.mockResolvedValueOnce(session);
        await expect(AdminLayout({ children: <p>x</p> })).resolves.toBeTruthy();
        expect(mocks.requireRole).toHaveBeenCalledWith(["admin", "owner"], "/org/admin");
        expect(mocks.scheduleShadow).toHaveBeenCalledWith(session, ["guard:/org/admin"]);
    });
});
