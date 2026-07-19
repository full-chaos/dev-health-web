import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

import { AdminSidebar } from "./AdminSidebar";

let pathname = "/org/admin";

vi.mock("next/navigation", () => ({
    usePathname: () => pathname,
}));

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: {
        href: string;
        children: ReactNode;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

vi.mock("@/components/navigation/OrgSwitcher", () => ({
    OrgSwitcher: () => <div data-testid="org-switcher">Org switcher</div>,
}));

describe("AdminSidebar", () => {
    beforeEach(() => {
        pathname = "/org/admin";
    });

    it("renders without crashing and highlights the current route", () => {
        render(<AdminSidebar />);

        expect(screen.getByText("Full Chaos Dev Health Ops")).toBeInTheDocument();
        expect(screen.getByTestId("org-switcher")).toBeInTheDocument();
        expect(
            screen.queryByRole("link", { name: /product telemetryusage/i }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /dashboardoverview/i })).toHaveAttribute(
            "aria-current",
            "page",
        );
    });

    it("renders superuser mode with platform admin links and hides organization nav", () => {
        render(<AdminSidebar isSuperuser={true} />);

        expect(screen.getAllByText("Platform Admin")).toHaveLength(2);
        expect(screen.getByRole("link", { name: /platform adminglobal/i })).toBeInTheDocument();
        expect(
            screen.queryByRole("link", { name: /organizationworkspace settings/i }),
        ).not.toBeInTheDocument();
    });

    it("handles feature flags by including enabled admin links only", () => {
        render(
            <AdminSidebar
                features={{
                    audit_log: true,
                    ip_allowlist: false,
                    custom_retention: true,
                    byo_llm: true,
                }}
            />,
        );

        expect(screen.getByRole("link", { name: /audit logsaccess history/i })).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /data retentionretention policy/i }),
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /ai setupmodel provider/i })).toBeInTheDocument();
        expect(
            screen.queryByRole("link", { name: /ip allowlistnetwork access/i }),
        ).not.toBeInTheDocument();
    });

    it("keeps mobile navigation collapsed until its keyboard control opens it", async () => {
        const user = userEvent.setup();
        render(<AdminSidebar />);

        const control = screen.getByRole("button", { name: "Show admin navigation" });
        const panel = screen.getByTestId("admin-navigation-panel");

        expect(control).toHaveAttribute("aria-expanded", "false");
        expect(panel).toHaveClass("hidden");

        await user.tab();
        expect(control).toHaveFocus();
        await user.keyboard("{Enter}");

        expect(control).toHaveAttribute("aria-expanded", "true");
        expect(panel).not.toHaveClass("hidden");

        await user.keyboard("{Escape}");

        expect(control).toHaveFocus();
        expect(control).toHaveAttribute("aria-expanded", "false");
        expect(panel).toHaveClass("hidden");
    });

    it.each([
        ["/org/admin/users/new", /usersorg members/i],
        ["/org/admin/integrations/github", /providersconnected sources/i],
        ["/org/admin/teams/team-1/edit", /teamsteam ownership/i],
    ])("keeps the parent nav item active for descendant route %s", (route, linkName) => {
        pathname = route;

        render(<AdminSidebar />);

        const activeLinks = screen
            .getAllByRole("link")
            .filter((link) => link.getAttribute("aria-current") === "page");
        expect(activeLinks).toHaveLength(1);
        expect(screen.getByRole("link", { name: linkName })).toHaveAttribute(
            "aria-current",
            "page",
        );
    });
});
