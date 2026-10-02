import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { AdminHeader } from "./AdminHeader";
import { AdminNavProvider } from "./AdminTabs";

const navigation = vi.hoisted(() => ({ pathname: "/org/admin/users" }));
vi.mock("next/navigation", () => ({
    usePathname: () => navigation.pathname,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

describe("AdminHeader", () => {
    it("renders without crashing", () => {
        render(<AdminHeader title="Billing" />);

        expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
    });

    it("renders with title and description", () => {
        render(
            <AdminHeader
                title="Billing"
                description="Manage plan, invoices, and payment methods."
            />,
        );

        expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
        expect(screen.getByText("Manage plan, invoices, and payment methods.")).toBeInTheDocument();
    });

    it("handles optional children gracefully", () => {
        render(
            <AdminHeader title="Billing">
                <button type="button">Upgrade plan</button>
            </AdminHeader>,
        );

        expect(screen.getByRole("button", { name: "Upgrade plan" })).toBeInTheDocument();
    });

    // CHAOS-7591 (AD-1 option A): the shared page header and the Admin tab row.
    it("is the shared PageHeader: one h1, the actions in its actions slot, the trail as eyebrow", () => {
        navigation.pathname = "/org/admin/users";
        render(
            <AdminHeader title="Users" description="Manage organization members.">
                <button type="button">Add User</button>
            </AdminHeader>,
        );

        const header = screen.getByTestId("page-header");
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Users");
        expect(screen.getByTestId("page-header-actions")).toContainElement(
            screen.getByRole("button", { name: "Add User" }),
        );
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent("Admin / Organization");
        expect(header).not.toHaveTextContent("Home");
    });

    it("shows the tab row of the page's Admin destination below the header", () => {
        navigation.pathname = "/org/admin/sync";
        render(<AdminHeader title="Sync Status" />);

        const row = screen.getByRole("tablist", { name: "Connections views" });
        expect(screen.getByTestId("page-header").compareDocumentPosition(row)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
    });

    it("shows the Platform Admin pill only to a platform admin", () => {
        navigation.pathname = "/org/admin";
        const { unmount } = render(<AdminHeader title="Admin Dashboard" />);
        expect(screen.queryByText("Platform Admin")).toBeNull();
        unmount();

        render(
            <AdminNavProvider isPlatformAdmin>
                <AdminHeader title="Admin Dashboard" />
            </AdminNavProvider>,
        );
        const marks = screen.getAllByText("Platform Admin");
        // The pill in the header meta row, and the link at the end of the Organization row.
        expect(marks).toHaveLength(2);
        expect(screen.getByTestId("page-header")).toContainElement(marks[0]);
        expect(screen.getByRole("link", { name: "Platform Admin" })).toHaveAttribute(
            "href",
            "/superadmin",
        );
    });

    it("shows the Platform row on a platform admin page (CHAOS-7967)", () => {
        navigation.pathname = "/superadmin/users";
        render(
            <AdminNavProvider isPlatformAdmin>
                <AdminHeader title="Users" />
            </AdminNavProvider>,
        );

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Users");
        expect(screen.getByRole("tab", { name: "Users" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tablist", { name: "Platform views" })).toBeInTheDocument();
    });

    it("has no tab row on a page outside the Admin tabs", () => {
        navigation.pathname = "/demo";
        render(<AdminHeader title="Demo" />);

        expect(screen.queryByRole("tablist")).toBeNull();
    });
});
