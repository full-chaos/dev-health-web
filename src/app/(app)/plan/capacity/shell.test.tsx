import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";

import PlanCapacityPage from "./page";

// The Completion Forecast inside the shared app shell. The header and the scope
// bar are outside the upgrade gate, as they were: an organization with no
// entitlement still sees where it is.

const scopeBarSpy = vi.hoisted(() => vi.fn());
const entitlements = vi.hoisted(() => ({ features: {} as Record<string, boolean> }));

vi.mock("next/navigation", () => ({
    usePathname: () => "/plan/capacity",
    useSearchParams: () => new URLSearchParams("role=em&origin=cockpit"),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { org_id: "org-1", email: "admin@devhealth.example" } },
        status: "authenticated",
        update: vi.fn(),
    }),
    signOut: vi.fn(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({
    ScopeBar: (props: Record<string, unknown>) => {
        scopeBarSpy(props);
        return <section data-testid="scope-bar" />;
    },
}));
vi.mock("@/components/work/CapacityView", () => ({
    CapacityView: () => <div data-testid="capacity-view" />,
}));
vi.mock("@/components/capacity/ForecastEvidenceAction", () => ({
    ForecastEvidenceAction: () => <button type="button">View evidence</button>,
}));
vi.mock("@/components/capacity/RefreshForecastButton", () => ({
    RefreshForecastButton: () => <button type="button">Refresh Forecast</button>,
}));
vi.mock("@/lib/graphql/HydrateUrqlResults", () => ({ HydrateUrqlResults: () => null }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: vi.fn().mockResolvedValue({ data: { id: "org-1" } }),
    getOrgEntitlements: vi.fn(async () => ({
        data: { tier: "community", features: entitlements.features },
    })),
}));
vi.mock("@/lib/runtimeConfig", () => ({
    runtimeConfig: { useGraphQLAnalytics: () => false },
}));

async function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                {await PlanCapacityPage({
                    searchParams: Promise.resolve({ role: "em", origin: "cockpit" }),
                })}
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarSpy.mockClear();
    entitlements.features = { capacity_forecast: true };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Completion Forecast in the shared app shell", () => {
    it("has one main, one h1 and the method text", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Completion Forecast");
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent(
            "Plan / Completion Forecast",
        );
        expect(
            within(screen.getByTestId("page-header")).getByText(
                /Monte Carlo is the method behind this completion projection/,
            ),
        ).toBeInTheDocument();
    });

    it("has no in-page back link: the Plan crumb is the return path, with the state", async () => {
        await renderPage();

        expect(
            within(screen.getByRole("main")).queryByRole("link", { name: /Back to/ }),
        ).toBeNull();
        const crumb = within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole(
            "link",
            { name: "Plan" },
        );
        const url = new URL(crumb.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/plan");
        expect(url.searchParams.has("f")).toBe(true);
        expect(url.searchParams.get("role")).toBe("em");
        expect(url.searchParams.get("origin")).toBe("cockpit");
    });

    it("renders one scope bar for the capacity view, with the origin, above the forecast", async () => {
        await renderPage();

        expect(scopeBarSpy).toHaveBeenCalledWith({
            view: "capacity-planning",
            origin: "cockpit",
        });
        const bar = screen.getByTestId("scope-bar");
        expect(
            bar.compareDocumentPosition(screen.getByTestId("capacity-view")) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("keeps the header and the scope bar outside the upgrade gate", async () => {
        entitlements.features = {};
        await renderPage();

        // The gate is a warn notice and an empty card: the forecast is not drawn at all.
        // The header and the scope bar are outside the gate.
        expect(screen.getByRole("heading", { name: "Unlock capacity forecast" })).toBeVisible();
        expect(screen.queryByTestId("capacity-view")).toBeNull();
        expect(screen.getByTestId("upgrade-gate-empty")).toBeInTheDocument();
        expect(
            screen.getByTestId("page-header").closest('[data-testid="upgrade-gate"]'),
        ).toBeNull();
        expect(screen.getByTestId("scope-bar").closest('[data-testid="upgrade-gate"]')).toBeNull();
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Completion Forecast");
    });

    it("puts Refresh Forecast in the page header actions when the gate is open", async () => {
        await renderPage();

        const header = screen.getByTestId("page-header");
        expect(
            within(header).getByRole("button", { name: "Refresh Forecast" }),
        ).toBeInTheDocument();
        expect(within(header).getByRole("button", { name: "View evidence" })).toBeInTheDocument();
        expect(within(header).getByRole("heading", { level: 1 })).toHaveTextContent(
            "Completion Forecast",
        );
    });

    it("has no Refresh Forecast in the header when the upgrade gate is closed", async () => {
        entitlements.features = {};
        await renderPage();

        expect(
            within(screen.getByTestId("page-header")).queryByRole("button", {
                name: "Refresh Forecast",
            }),
        ).toBeNull();
        expect(screen.queryByRole("button", { name: "Refresh Forecast" })).toBeNull();
        expect(screen.queryByRole("button", { name: "View evidence" })).toBeNull();
    });
});
