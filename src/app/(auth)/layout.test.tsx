import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { expectStaticLogo } from "@/test/staticLogo";

import AuthLayout from "./layout";

vi.mock("@/components/auth/SessionProvider", () => ({
    SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("sonner", () => ({ Toaster: () => null }));

describe("auth layout brand", () => {
    it("draws the SVG logo as a static file, in its 41 x 40 box (CHAOS-8545)", () => {
        render(
            <AuthLayout>
                <p>content</p>
            </AuthLayout>,
        );

        const logo = screen.getByRole("img", { name: "Full Chaos Dev Health logo" });
        expectStaticLogo(logo, { file: "fc-logo.svg", width: 41, height: 40 });
        expect(logo).toHaveClass("h-10", "w-auto");
    });
});
