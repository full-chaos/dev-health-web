import { describe, expect, it, vi } from "vitest";

const requireSuperuser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireSuperuser }));

import SuperadminLayout from "./layout";

describe("platform admin gate on the server (CHAOS-8966)", () => {
    it("does not render the page for a non-platform-admin (the guard redirects)", async () => {
        requireSuperuser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
        await expect(SuperadminLayout({ children: <p>secret page</p> })).rejects.toThrow(
            "NEXT_REDIRECT",
        );
    });

    it("renders the page for a platform admin", async () => {
        requireSuperuser.mockResolvedValueOnce({});
        await expect(SuperadminLayout({ children: <p>page</p> })).resolves.toBeTruthy();
        expect(requireSuperuser).toHaveBeenCalledWith("/superadmin");
    });
});
