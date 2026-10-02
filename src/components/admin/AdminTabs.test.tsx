import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminTierProvider } from "./AdminTierContext";
import { AdminNavProvider, AdminTabs } from "./AdminTabs";

const navigation = vi.hoisted(() => ({ pathname: "/org/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

const ALL_FEATURES = { audit_log: true, ip_allowlist: true, custom_retention: true, byo_llm: true };

function renderAt(
    pathname: string,
    {
        features = {},
        isPlatformAdmin = false,
    }: { features?: Record<string, boolean>; isPlatformAdmin?: boolean } = {},
) {
    navigation.pathname = pathname;
    return render(
        <AdminTierProvider tier="enterprise" features={features}>
            <AdminNavProvider isPlatformAdmin={isPlatformAdmin}>
                <AdminTabs />
            </AdminNavProvider>
        </AdminTierProvider>,
    );
}

const tabNames = (row: HTMLElement) =>
    within(row)
        .getAllByRole("tab")
        .map((tab) => tab.textContent);

describe("AdminTabs (AD-1 option A)", () => {
    beforeEach(() => {
        navigation.pathname = "/org/admin";
    });

    it("shows the Organization row on an Organization page, without the feature tabs the org lacks", () => {
        renderAt("/org/admin/users");
        const row = screen.getByRole("tablist", { name: "Organization views" });
        expect(tabNames(row)).toEqual(["Overview", "Users", "Teams", "Identities", "Settings"]);
        expect(within(row).getByRole("tab", { name: "Users" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        expect(within(row).getByRole("tab", { name: "Users" })).toHaveAttribute(
            "href",
            "/org/admin/users",
        );
        expect(within(row).getByRole("tab", { name: "Overview" })).toHaveAttribute(
            "href",
            "/org/admin",
        );
        expect(within(row).getByRole("tab", { name: "Settings" })).toHaveAttribute(
            "href",
            "/org/admin/settings",
        );
    });

    it("shows each feature tab when the organization has its feature, in the design's order", () => {
        renderAt("/org/admin", { features: ALL_FEATURES });
        expect(tabNames(screen.getByRole("tablist", { name: "Organization views" }))).toEqual([
            "Overview",
            "Users",
            "Teams",
            "Identities",
            "Audit Logs",
            "IP Allowlist",
            "Data Retention",
            "AI Setup",
            "Settings",
        ]);
        renderAt("/org/admin", { features: { byo_llm: true } });
        expect(screen.getAllByRole("tab", { name: "AI Setup" })[1]).toHaveAttribute(
            "href",
            "/org/admin/ai",
        );
    });

    it("marks the tab of a page below a tab route", () => {
        renderAt("/org/admin/users/u1/edit");
        expect(screen.getByRole("tab", { name: "Users" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
            "aria-selected",
            "false",
        );
    });

    it("shows the Connections row on a Sync Status or Providers page", () => {
        renderAt("/org/admin/integrations/github/sync");
        const row = screen.getByRole("tablist", { name: "Connections views" });
        expect(tabNames(row)).toEqual(["Sync Status", "Providers"]);
        expect(within(row).getByRole("tab", { name: "Providers" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        expect(within(row).getByRole("tab", { name: "Sync Status" })).toHaveAttribute(
            "href",
            "/org/admin/sync",
        );
        expect(screen.queryByRole("tablist", { name: "Organization views" })).toBeNull();
    });

    it("gives a platform admin the Platform Admin link on the Organization row and hides Settings, as the old sidebar did", () => {
        renderAt("/org/admin", { isPlatformAdmin: true });
        expect(screen.getByRole("link", { name: "Platform Admin" })).toHaveAttribute(
            "href",
            "/superadmin",
        );
        expect(screen.queryByRole("tab", { name: "Settings" })).toBeNull();
    });

    it("gives no Platform Admin link to an org admin, and none on the Connections row", () => {
        renderAt("/org/admin");
        expect(screen.queryByRole("link", { name: "Platform Admin" })).toBeNull();
        renderAt("/org/admin/sync", { isPlatformAdmin: true });
        expect(
            within(
                screen.getByRole("tablist", { name: "Connections views" }).parentElement!,
            ).queryByRole("link", { name: "Platform Admin" }),
        ).toBeNull();
    });

    it("shows the Data Confidence row on a data health page (CHAOS-7966)", () => {
        renderAt("/data-health/mapping", { isPlatformAdmin: true });
        const row = screen.getByRole("tablist", { name: "Data Confidence views" });
        expect(tabNames(row)).toEqual(["Overview", "Connectors", "Identity", "Mapping"]);
        expect(within(row).getByRole("tab", { name: "Mapping" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        expect(screen.queryByRole("link", { name: "Platform Admin" })).toBeNull();
    });

    it("shows the Platform row on a platform admin page, and the Platform billing row on a billing page (CHAOS-7967)", () => {
        renderAt("/superadmin/orgs/o1", { isPlatformAdmin: true });
        const platform = screen.getByRole("tablist", { name: "Platform views" });
        expect(tabNames(platform)).toEqual([
            "Overview",
            "Organizations",
            "Users",
            "Licensing",
            "Product Telemetry",
            "Context Fabric Validation",
            "Audit Log",
            "Settings",
        ]);
        expect(within(platform).getByRole("tab", { name: "Organizations" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        // The Platform Admin link belongs to the Organization row only.
        expect(screen.queryByRole("link", { name: "Platform Admin" })).toBeNull();

        renderAt("/superadmin/billing/audit", { isPlatformAdmin: true });
        const billing = screen.getByRole("tablist", { name: "Platform billing views" });
        expect(tabNames(billing)).toEqual([
            "Billing Plans",
            "Invoices",
            "Subscriptions",
            "Refunds",
            "Billing Audit",
        ]);
        expect(within(billing).getByRole("tab", { name: "Billing Audit" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
    });

    it("renders nothing outside the Admin tab routes", () => {
        const { container } = renderAt("/demo");
        expect(container).toBeEmptyDOMElement();
        expect(renderAt("/testops/pipelines").container).toBeEmptyDOMElement();
        expect(renderAt("/settings").container).toBeEmptyDOMElement();
    });
});
