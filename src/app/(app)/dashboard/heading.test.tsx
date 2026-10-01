import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { checkApiHealth, getApiMeta } from "@/lib/api/system";
import { getSetupStatus } from "@/lib/admin/server";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";

import Home from "./page";

// The Cockpit's header is the shared PageHeader: one h1 for the page, the
// eyebrow from the navigation trail. The health summary is rendered for real
// here, because it used to bring a second h1.

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
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

vi.mock("@/lib/graphql/homeFetchers", () => ({ getHomeDataViaGraphQL: vi.fn() }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn(), getApiMeta: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({ getSetupStatus: vi.fn() }));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn(async () => ({ user: { org_id: "org-1" } })),
}));

vi.mock("@/components/home/AiWorkflowCallout", () => ({ AiWorkflowCallout: () => null }));
vi.mock("@/components/home/BackendBanner", () => ({ BackendBanner: () => null }));
vi.mock("@/components/home/CockpitClient", () => ({ CockpitClient: () => null }));
vi.mock("@/components/home/DataConfidenceIndicator", () => ({
    DataConfidenceIndicator: () => null,
}));
vi.mock("@/components/home/InvestmentPreview", () => ({ InvestmentPreview: () => null }));
vi.mock("@/components/home/RankedSignals", () => ({ RankedSignals: () => null }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/onboarding/SetupBanner", () => ({ SetupBanner: () => null }));

async function renderCockpit() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>{await Home({ searchParams: Promise.resolve({}) })}</AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    vi.mocked(checkApiHealth).mockResolvedValue({ ok: true, data: null });
    vi.mocked(getApiMeta).mockResolvedValue(null);
    vi.mocked(getSetupStatus).mockResolvedValue({ error: "not needed for this test" });
    vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(null as never);
});

describe("Cockpit page header", () => {
    it("has exactly one h1 on the page: the page title", async () => {
        await renderCockpit();

        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Developer Health Ops Cockpit");
        expect(within(screen.getByTestId("page-header")).getByRole("heading", { level: 1 })).toBe(
            headings[0],
        );
    });

    it("keeps the health headline as a section heading under the title", async () => {
        await renderCockpit();

        const headline = screen.getByTestId("cockpit-headline");
        expect(headline.tagName).toBe("H2");
        expect(headline).toHaveTextContent("Engineering health is steady this week");
    });

    it("takes the eyebrow from the navigation trail", async () => {
        await renderCockpit();

        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent("Cockpit");
        expect(screen.queryByText("Status")).toBeNull();
    });

    it("keeps the subtitle and the last-updated row in the header, and shows no BackLink", async () => {
        await renderCockpit();

        const header = screen.getByTestId("page-header");
        expect(
            within(header).getByText(/System patterns over the last \d+ days\./),
        ).toBeInTheDocument();
        expect(within(header).getByText(/Last updated:/)).toBeInTheDocument();
        expect(within(header).queryAllByRole("link")).toHaveLength(0);
    });
});
