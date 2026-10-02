import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { FILTER_OPTIONS, scopeBarUrl } from "@/test/scopeBarHarness";
import { checkApiHealth, getApiMeta } from "@/lib/api/system";
import { getSetupStatus } from "@/lib/admin/server";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";

import Home from "./page";

// The Cockpit has ONE scope bar: the global context bar and the page filter bar
// are merged. The bar is rendered for real here.

vi.mock("next/navigation", () => ({
    usePathname: () => scopeBarUrl.pathname,
    useSearchParams: () => new URLSearchParams(scopeBarUrl.search),
    useRouter: () => ({ refresh: vi.fn(), replace: scopeBarUrl.replace, push: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { org_id: "org-1", email: "admin@devhealth.example" } },
        status: "authenticated",
        update: vi.fn(),
    }),
    signOut: vi.fn(),
}));
vi.mock("@/components/filters/useFilterOptions", () => ({
    useFilterOptions: () => FILTER_OPTIONS,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: vi.fn() }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn(), getApiMeta: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({ getSetupStatus: vi.fn() }));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn(async () => ({ user: { org_id: "org-1" } })),
}));

vi.mock("@/components/home/AiWorkflowCallout", () => ({ AiWorkflowCallout: () => null }));
vi.mock("@/components/home/BackendBanner", () => ({ BackendBanner: () => null }));
vi.mock("@/components/home/CockpitClient", () => ({ CockpitClient: () => null }));
vi.mock("@/components/home/CockpitSummary", () => ({ CockpitSummary: () => null }));
vi.mock("@/components/home/DataConfidenceIndicator", () => ({
    DataConfidenceIndicator: () => null,
}));
vi.mock("@/components/home/InvestmentPreview", () => ({ InvestmentPreview: () => null }));
vi.mock("@/components/home/RankedSignals", () => ({ RankedSignals: () => null }));
vi.mock("@/components/onboarding/SetupBanner", () => ({ SetupBanner: () => null }));

const fetchMock = vi.fn();

async function renderCockpit() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>{await Home({ searchParams: Promise.resolve({}) })}</AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    scopeBarUrl.reset("role=em");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
            active_org_id: "org-1",
            organizations: [
                {
                    id: "org-1",
                    slug: "acme",
                    name: "Acme",
                    role: "owner",
                    has_data: true,
                    last_metrics_at: "2026-09-30T10:00:00Z",
                },
            ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(checkApiHealth).mockResolvedValue({ ok: true, data: null });
    vi.mocked(getApiMeta).mockResolvedValue(null);
    vi.mocked(getSetupStatus).mockResolvedValue({ error: "not needed for this test" });
    vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(null as never);
});

describe("Cockpit scope bar", () => {
    it("renders exactly one bar: the scope bar, not the two old bars", async () => {
        await renderCockpit();

        expect(screen.getAllByTestId("scope-bar")).toHaveLength(1);
        expect(screen.queryByTestId("global-context-bar")).toBeNull();
        expect(screen.queryByTestId("filter-bar")).toBeNull();
        expect(screen.queryByRole("region", { name: "Global context" })).toBeNull();
        expect(screen.getByRole("main")).toContainElement(screen.getByTestId("scope-bar"));
    });

    it("has the Cockpit's page filters behind the Filters button, and the scope controls in the row", async () => {
        await renderCockpit();

        const row = within(screen.getByTestId("scope-bar-row"));
        expect(row.getByRole("button", { name: /^Team/ })).toBeInTheDocument();
        expect(row.getByRole("button", { name: /^Repo/ })).toBeInTheDocument();
        expect(row.getByRole("group", { name: "Window" })).toBeInTheDocument();
        expect(row.getByRole("button", { name: /^Filters$/ })).toBeInTheDocument();
        expect(screen.getByTestId("scope-bar")).toHaveAttribute("data-view", "home");
    });

    it("shows the organization the sidebar card loaded, with one request for both", async () => {
        await renderCockpit();

        const row = within(screen.getByTestId("scope-bar-row"));
        await waitFor(() => expect(row.getByRole("button", { name: "Acme" })).toBeInTheDocument());
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("adds the default `f` to the URL and keeps the other params", async () => {
        await renderCockpit();

        await waitFor(() => expect(scopeBarUrl.replace).toHaveBeenCalled());
        expect(scopeBarUrl.lastParams().has("f")).toBe(true);
        expect(scopeBarUrl.lastParams().get("role")).toBe("em");
    });
});
