import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminNavProvider } from "@/components/admin/AdminTabs";
import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";

import AdminLayout from "./layout";

// CHAOS-7591 (AD-1 option A): the org admin pages are in the shared app shell. The shell
// sidebar shows Admin with its four destinations; the admin sidebar, its "Return to main
// app" note and the layout's own `<main>` are gone; each page header brings the tab row.

const navigation = vi.hoisted(() => ({ pathname: "/org/admin/users" }));
const session = vi.hoisted(() => ({
    user: { org_id: "org-1", role: "admin", is_superuser: false } as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
    usePathname: () => navigation.pathname,
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
    redirect: vi.fn(),
}));
vi.mock("next/headers", () => ({
    headers: async () => new Headers({ "x-dev-health-path": navigation.pathname }),
}));
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn(async () => ({ user: session.user })) }));
vi.mock("@/lib/admin/server", () => ({
    getOrgEntitlements: vi.fn(async () => ({
        data: { tier: "enterprise", features: { audit_log: true } },
    })),
}));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { org_id: "org-1", email: "admin@devhealth.example" } },
        status: "authenticated",
        update: vi.fn(),
    }),
    signOut: vi.fn(),
}));

async function renderAdminPage(pathname: string, title: string) {
    navigation.pathname = pathname;
    const page = (
        <div>
            <AdminHeader title={title} description="Page description." />
            <p>Page content</p>
        </div>
    );
    const layout = await AdminLayout({ children: page });
    // The authed app layout provides the platform admin flag from the session (CHAOS-7967).
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AdminNavProvider isPlatformAdmin={session.user.is_superuser === true}>
                <AppShell>{layout}</AppShell>
            </AdminNavProvider>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    session.user = { org_id: "org-1", role: "admin", is_superuser: false };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("org admin pages in the shared app shell (CHAOS-7591)", () => {
    it("has one sidebar, one main with the page in it, and one h1", async () => {
        await renderAdminPage("/org/admin/users", "Users");

        expect(screen.getByTestId("app-shell")).toContainElement(
            screen.getByTestId("shell-sidebar"),
        );
        expect(document.querySelectorAll("aside")).toHaveLength(1);
        const mains = screen.getAllByRole("main");
        expect(mains).toHaveLength(1);
        expect(within(mains[0]).getByText("Page content")).toBeInTheDocument();
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Users");
    });

    it("has no admin sidebar: no admin navigation, no mobile admin button, no 'Return to main app'", async () => {
        await renderAdminPage("/org/admin/users", "Users");

        expect(screen.queryByRole("navigation", { name: "Admin navigation" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Show admin navigation" })).toBeNull();
        expect(screen.queryByText(/Return to/)).toBeNull();
    });

    it("expands Admin in the shell sidebar and marks Organization on an Organization page", async () => {
        await renderAdminPage("/org/admin/users", "Users");

        const children = screen.getByTestId("nav-children-admin");
        expect(
            within(children)
                .getAllByRole("link")
                .map((link) => link.textContent),
        ).toEqual(["Organization", "Connections", "Data Confidence", "Settings"]);
        expect(within(children).getByRole("link", { name: "Organization" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
            "Admin/Organization",
        );
        const row = screen.getByRole("tablist", { name: "Organization views" });
        expect(within(row).getByRole("tab", { name: "Users" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        // The layout passes the organization's entitlements to the row.
        expect(within(row).getByRole("tab", { name: "Audit Logs" })).toBeInTheDocument();
        expect(within(row).queryByRole("tab", { name: "IP Allowlist" })).toBeNull();
    });

    it("marks Connections on a Providers page", async () => {
        await renderAdminPage("/org/admin/integrations", "Providers");

        const children = screen.getByTestId("nav-children-admin");
        expect(within(children).getByRole("link", { name: "Connections" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(
            within(screen.getByRole("tablist", { name: "Connections views" })).getByRole("tab", {
                name: "Providers",
            }),
        ).toHaveAttribute("aria-selected", "true");
    });

    it("gives a platform admin the pill, the Platform Admin link and the two platform destinations", async () => {
        session.user = { org_id: "org-1", role: "admin", is_superuser: true };
        await renderAdminPage("/org/admin", "Admin Dashboard");

        expect(
            within(screen.getByTestId("page-header")).getByText("Platform Admin"),
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Platform Admin" })).toHaveAttribute(
            "href",
            "/superadmin",
        );
        expect(
            within(screen.getByTestId("nav-children-admin"))
                .getAllByRole("link")
                .map((link) => link.textContent),
        ).toEqual([
            "Organization",
            "Connections",
            "Data Confidence",
            "Settings",
            "Platform",
            "Platform billing",
        ]);
    });

    it("lists no platform destination for an org admin", async () => {
        await renderAdminPage("/org/admin", "Admin Dashboard");

        const children = screen.getByTestId("nav-children-admin");
        expect(within(children).queryByRole("link", { name: "Platform" })).toBeNull();
        expect(within(children).queryByRole("link", { name: "Platform billing" })).toBeNull();
    });
});
