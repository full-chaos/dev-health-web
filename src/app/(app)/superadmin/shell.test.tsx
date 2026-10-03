import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminNavProvider } from "@/components/admin/AdminTabs";
import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";

import SuperadminLayout from "./layout";

// CHAOS-7967: the platform admin pages are in the shared app shell, with no sidebar of their
// own. For a platform admin the shell sidebar lists Admin → Platform and Platform billing; each
// page header brings the tab row of its destination.

const navigation = vi.hoisted(() => ({ pathname: "/superadmin/orgs" }));

vi.mock("next/navigation", () => ({
    usePathname: () => navigation.pathname,
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
    redirect: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
    requireSuperuser: vi.fn(async () => ({ user: { is_superuser: true, role: "admin" } })),
}));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { org_id: "org-1", email: "admin@devhealth.example" } },
        status: "authenticated",
        update: vi.fn(),
    }),
    signOut: vi.fn(),
}));

async function renderAt(pathname: string, title: string) {
    navigation.pathname = pathname;
    const layout = await SuperadminLayout({
        children: (
            <div>
                <AdminHeader title={title} />
                <p>Page content</p>
            </div>
        ),
    });
    // The authed app layout provides the platform admin flag from the session.
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AdminNavProvider isPlatformAdmin>
                <AppShell>{layout}</AppShell>
            </AdminNavProvider>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("platform admin pages in the shared app shell (CHAOS-7967)", () => {
    it("has one sidebar, one main with the page in it, and one h1", async () => {
        await renderAt("/superadmin/orgs", "Organizations");

        expect(screen.getByTestId("app-shell")).toContainElement(
            screen.getByTestId("shell-sidebar"),
        );
        expect(document.querySelectorAll("aside")).toHaveLength(1);
        const mains = screen.getAllByRole("main");
        expect(mains).toHaveLength(1);
        expect(within(mains[0]).getByText("Page content")).toBeInTheDocument();
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Organizations");
    });

    it("has no platform admin sidebar: no 'Superadmin' panel, no 'Return to org admin'", async () => {
        await renderAt("/superadmin/orgs", "Organizations");

        expect(screen.queryByText("Global platform management.")).toBeNull();
        expect(screen.queryByText(/Return to/)).toBeNull();
    });

    it("marks Platform in the expanded Admin area and the Organizations tab", async () => {
        await renderAt("/superadmin/orgs", "Organizations");

        const children = screen.getByTestId("nav-children-admin");
        expect(within(children).getByRole("link", { name: "Platform" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
            "Admin/Platform",
        );
        expect(
            within(screen.getByRole("tablist", { name: "Platform views" })).getByRole("tab", {
                name: "Organizations",
            }),
        ).toHaveAttribute("aria-selected", "true");
        // The Platform Admin pill of the old sidebar is in the page header.
        expect(
            within(screen.getByTestId("page-header")).getByText("Platform admin"),
        ).toBeInTheDocument();
    });

    it("marks Platform billing on a billing page", async () => {
        await renderAt("/superadmin/billing/invoices", "Invoices");

        expect(
            within(screen.getByTestId("nav-children-admin")).getByRole("link", {
                name: "Platform billing",
            }),
        ).toHaveAttribute("aria-current", "page");
        expect(
            within(screen.getByRole("tablist", { name: "Platform billing views" })).getByRole(
                "tab",
                { name: "Invoices" },
            ),
        ).toHaveAttribute("aria-selected", "true");
    });
});
