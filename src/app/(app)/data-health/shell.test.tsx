import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";

import DataHealthLayout from "./layout";
import DataHealthOverviewPage from "./page";
import DataHealthIdentityPage from "./identity/page";

// CHAOS-7966 (AD-1 option A): Data Confidence in the shared app shell. The pages had no
// navigation and no way back; now Admin is expanded with Data Confidence current, and each
// page header brings the Data Confidence tab row.

const navigation = vi.hoisted(() => ({ pathname: "/data-health" }));

vi.mock("next/navigation", () => ({
    usePathname: () => navigation.pathname,
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
    redirect: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
    requireRole: vi.fn(async () => ({ user: { org_id: "org-1", role: "admin" } })),
    requireSession: vi.fn(async () => ({ user: { org_id: "org-1", role: "admin" } })),
}));
vi.mock("@/lib/graphql/urqlClient", () => ({
    graphqlFetch: vi.fn(async () => ({
        dataHealth: {
            connectors: [],
            identityMapping: { unmappedCount: 0 },
            mappingCoverage: {
                deployments: { coveragePct: 0.5 },
                workItems: { coveragePct: 0.25 },
            },
        },
    })),
}));
vi.mock("@/lib/admin/server", () => ({
    getOrgEntitlements: vi.fn(async () => ({ data: { tier: "team", features: {} } })),
}));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { org_id: "org-1", email: "admin@devhealth.example" } },
        status: "authenticated",
        update: vi.fn(),
    }),
    signOut: vi.fn(),
}));
vi.mock("./_components/IdentityGapsTable", () => ({
    IdentityGapsTable: () => <p>Identity gaps</p>,
}));

async function renderAt(pathname: string, page: React.ReactNode) {
    navigation.pathname = pathname;
    const layout = await DataHealthLayout({ children: page });
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>{layout}</AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Data Confidence in the shared app shell (CHAOS-7966)", () => {
    it("the overview has one sidebar, one main with the page in it, and one h1", async () => {
        await renderAt("/data-health", await DataHealthOverviewPage());

        expect(document.querySelectorAll("aside")).toHaveLength(1);
        const mains = screen.getAllByRole("main");
        expect(mains).toHaveLength(1);
        expect(within(mains[0]).getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Data Confidence");
    });

    it("marks Data Confidence in the expanded Admin area and the Overview tab", async () => {
        await renderAt("/data-health", await DataHealthOverviewPage());

        const children = screen.getByTestId("nav-children-admin");
        expect(within(children).getByRole("link", { name: "Data Confidence" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
            "Admin/Data Confidence",
        );
        const row = screen.getByRole("tablist", { name: "Data Confidence views" });
        expect(
            within(row)
                .getAllByRole("tab")
                .map((tab) => tab.textContent),
        ).toEqual(["Overview", "Connectors", "Identity", "Mapping"]);
        expect(within(row).getByRole("tab", { name: "Overview" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
    });

    it("Identity Health has the shared header (its own h1 and main are gone) and the Identity tab", async () => {
        await renderAt("/data-health/identity", <DataHealthIdentityPage />);

        expect(screen.getAllByRole("main")).toHaveLength(1);
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(
            within(screen.getByTestId("page-header")).getByRole("heading", { level: 1 }),
        ).toHaveTextContent("Data Confidence");
        expect(screen.getByRole("tab", { name: "Identity" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        expect(screen.getByText("Identity gaps")).toBeInTheDocument();
    });
});
