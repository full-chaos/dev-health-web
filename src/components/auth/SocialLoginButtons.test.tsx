import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithToaster, screen, userEvent, cleanup } from "@/test/utils";

const { mockSignIn } = vi.hoisted(() => ({
    mockSignIn: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
    signIn: mockSignIn,
}));

import { SocialLoginButtons } from "@/components/auth/SocialLoginButtons";

describe("SocialLoginButtons", () => {
    beforeEach(() => {
        cleanup();
        mockSignIn.mockReset();
    });

    test("passes callbackUrl through to provider sign-in", async () => {
        renderWithToaster(
            <SocialLoginButtons callbackUrl="/dashboard" providers={["github", "google"]} />,
        );

        await userEvent.click(screen.getByRole("button", { name: /continue with github/i }));

        expect(mockSignIn).toHaveBeenCalledWith("github", { redirectTo: "/dashboard" });
    });

    test("omits callbackUrl when none is provided", async () => {
        renderWithToaster(<SocialLoginButtons providers={["gitlab"]} />);

        await userEvent.click(screen.getByRole("button", { name: /continue with gitlab/i }));

        expect(mockSignIn).toHaveBeenCalledWith("gitlab", undefined);
    });
});
