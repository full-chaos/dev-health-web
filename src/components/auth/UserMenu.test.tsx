import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CTA_LABELS } from "@/lib/design/cta";

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

    it("places Report issue immediately before Sign out in the account menu", async () => {
        const user = userEvent.setup();
        render(<UserMenu />);

        await user.tab();
        const accountControl = screen.getByRole("button", { name: CTA_LABELS.accountOptions });
        expect(accountControl).toHaveFocus();
        expect(accountControl).toHaveAttribute("aria-expanded", "false");

        await user.keyboard("{Enter}");
        expect(accountControl).toHaveAttribute("aria-expanded", "true");
        const preferences = screen.getByRole("link", { name: CTA_LABELS.preferences });
        expect(preferences).toHaveAttribute("href", "/settings");
        const adminPanel = screen.getByRole("link", { name: CTA_LABELS.adminPanel });
        const separator = screen.getByRole("separator");
        const signOut = screen.getByRole("button", { name: CTA_LABELS.signOut });
        const reportIssue = screen.getByRole("button", { name: CTA_LABELS.reportIssue });
        expect(signOut).toBeVisible();
        expect(reportIssue).toBeVisible();
        expect(reportIssue.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
        const menuActionButtons = Array.from(document.querySelectorAll("#account-options button"));
        expect(menuActionButtons).toEqual([reportIssue, signOut]);
        expect(adminPanel.nextElementSibling).toBe(separator);
        expect(separator.nextElementSibling).toBe(reportIssue);
        expect(reportIssue.nextElementSibling).toBe(signOut);

        await user.tab();
        expect(preferences).toHaveFocus();
        await user.click(reportIssue);
        const dialog = screen.getByRole("dialog", { name: CTA_LABELS.reportIssue });
        const title = screen.getByLabelText("Title");
        await user.click(title);
        expect(dialog).toBeVisible();
        expect(accountControl).toHaveAttribute("aria-expanded", "true");
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(reportIssue).toHaveFocus();
        await user.click(signOut);
        expect(signOutMock).toHaveBeenCalledOnce();
    });

    it("uses decorative icons for every account menu destination and action", async () => {
        const user = userEvent.setup();
        useSessionMock.mockReturnValue({
            data: { user: { email: "operator@example.com", is_superuser: true } },
            status: "authenticated",
        });
        render(<UserMenu />);

        await user.click(screen.getByRole("button", { name: CTA_LABELS.accountOptions }));

        for (const item of [
            screen.getByRole("link", { name: CTA_LABELS.platformAdmin }),
            screen.getByRole("link", { name: CTA_LABELS.preferences }),
            screen.getByRole("link", { name: CTA_LABELS.adminPanel }),
            screen.getByRole("button", { name: CTA_LABELS.reportIssue }),
            screen.getByRole("button", { name: CTA_LABELS.signOut }),
        ]) {
            expect(item.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
        }
    });
});
