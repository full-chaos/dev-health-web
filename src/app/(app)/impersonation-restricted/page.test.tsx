import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    notFound: vi.fn(() => {
        throw new Error("NEXT_NOT_FOUND");
    }),
}));

import ImpersonationRestrictedPage from "./page";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("impersonation deny page", () => {
    it.each([undefined, "off", "shadow", "Enforce"])(
        "C3/C4 AUTHZ_PLATFORM_UI=%j: the page does not exist, as on main",
        (value) => {
            if (value !== undefined) vi.stubEnv("AUTHZ_PLATFORM_UI", value);
            expect(() => ImpersonationRestrictedPage()).toThrow("NEXT_NOT_FOUND");
        },
    );

    it("C6 enforce: a clear notice that names the way back", () => {
        vi.stubEnv("AUTHZ_PLATFORM_UI", "enforce");
        render(ImpersonationRestrictedPage());
        expect(
            screen.getByText("Platform admin is not available while you impersonate a user"),
        ).toBeTruthy();
        expect(screen.getByText(/Stop Impersonating/)).toBeTruthy();
    });
});
