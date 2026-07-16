import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signOutMock, useSessionMock } = vi.hoisted(() => ({
    signOutMock: vi.fn(),
    useSessionMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
    signOut: signOutMock,
    useSession: useSessionMock,
}));

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

import { UserMenu } from "./UserMenu";

describe("UserMenu", () => {
    beforeEach(() => {
        signOutMock.mockReset();
        useSessionMock.mockReturnValue({
            data: { user: { email: "operator@example.com", is_superuser: false } },
            status: "authenticated",
        });
    });

    it("reveals Preferences and Sign out through the keyboard-accessible account control", async () => {
        const user = userEvent.setup();
        render(<UserMenu />);

        await user.tab();
        const accountControl = screen.getByRole("button", { name: "Account options" });
        expect(accountControl).toHaveFocus();
        expect(accountControl).toHaveAttribute("aria-expanded", "false");

        await user.keyboard("{Enter}");
        expect(accountControl).toHaveAttribute("aria-expanded", "true");
        const preferences = screen.getByRole("link", { name: "Preferences" });
        expect(preferences).toHaveAttribute("href", "/settings");
        expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();

        await user.tab();
        expect(preferences).toHaveFocus();
        await user.click(screen.getByRole("button", { name: "Sign out" }));
        expect(signOutMock).toHaveBeenCalledOnce();
    });
});
