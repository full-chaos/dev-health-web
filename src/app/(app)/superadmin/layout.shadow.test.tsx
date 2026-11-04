import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireSuperuser: vi.fn(), scheduleShadow: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireSuperuser: mocks.requireSuperuser }));
vi.mock("@/lib/auth/shadow", () => ({ scheduleShadow: mocks.scheduleShadow }));

import SuperadminLayout from "./layout";

describe("superadmin layout keeps its guard (shadow is advisory)", () => {
    beforeEach(() => {
        mocks.requireSuperuser.mockReset();
        mocks.scheduleShadow.mockReset();
    });

    it("still refuses when the guard redirects, and the shadow never runs", async () => {
        mocks.requireSuperuser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
        await expect(SuperadminLayout({ children: <p>x</p> })).rejects.toThrow("NEXT_REDIRECT");
        expect(mocks.scheduleShadow).not.toHaveBeenCalled();
    });

    it("renders for a platform admin and schedules the shadow for its surface", async () => {
        const session = { user: { id: "u", is_superuser: true } };
        mocks.requireSuperuser.mockResolvedValueOnce(session);
        await expect(SuperadminLayout({ children: <p>x</p> })).resolves.toBeTruthy();
        expect(mocks.scheduleShadow).toHaveBeenCalledWith(session, ["guard:/superadmin"]);
    });
});
