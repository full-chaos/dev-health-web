import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { checkApiHealth, getApiMeta } from "@/lib/api/system";
import { getSetupStatus } from "@/lib/admin/server";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";

import Loading from "./loading";
import Home from "./page";

// The Home inside the shared app shell: the layout owns the navigation and
// the `<main>` landmark, so the page must bring neither.

const pageLevelNavSpy = vi.hoisted(() => vi.fn());

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
vi.mock("@/components/home/CockpitSummary", () => ({ CockpitSummary: () => null }));
vi.mock("@/components/home/DataConfidenceIndicator", () => ({
    DataConfidenceIndicator: () => null,
}));
vi.mock("@/components/home/InvestmentPreview", () => ({ InvestmentPreview: () => null }));
vi.mock("@/components/home/RankedSignals", () => ({ RankedSignals: () => null }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/components/onboarding/SetupBanner", () => ({ SetupBanner: () => null }));
// A stand-in that would be visible as a second navigation if the page rendered it.
vi.mock("@/components/navigation/PrimaryNav", () => ({
    PrimaryNav: () => {
        pageLevelNavSpy();
        return <nav aria-label="Primary areas" data-testid="page-level-nav" />;
    },
}));

function renderInShell(page: React.ReactNode) {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>{page}</AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    pageLevelNavSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    vi.mocked(checkApiHealth).mockResolvedValue({ ok: true, data: null });
    vi.mocked(getApiMeta).mockResolvedValue(null);
    vi.mocked(getSetupStatus).mockResolvedValue({ error: "not needed for this test" });
    vi.mocked(getHomeDataViaGraphQL).mockResolvedValue(null as never);
});

describe("Home in the shared app shell", () => {
    it("has exactly one main landmark, and the page heading is inside it", async () => {
        renderInShell(await Home({ searchParams: Promise.resolve({}) }));

        const mains = screen.getAllByRole("main");
        expect(mains).toHaveLength(1);
        expect(mains[0]).toHaveAttribute("id", "main-content");
        expect(within(mains[0]).getByRole("heading", { name: "Home" })).toBeInTheDocument();
    });

    it("renders no page-level navigation: the shell's navigation is the only one", async () => {
        renderInShell(await Home({ searchParams: Promise.resolve({}) }));

        expect(pageLevelNavSpy).not.toHaveBeenCalled();
        expect(screen.queryByTestId("page-level-nav")).toBeNull();
        expect(screen.getAllByRole("navigation", { name: "Primary areas" })).toHaveLength(1);
        expect(document.querySelectorAll("aside")).toHaveLength(1);
    });

    it("keeps one main landmark when the data service is unavailable", async () => {
        vi.mocked(checkApiHealth).mockResolvedValue({ ok: false, data: null });

        renderInShell(await Home({ searchParams: Promise.resolve({}) }));

        const mains = screen.getAllByRole("main");
        expect(mains).toHaveLength(1);
        expect(
            within(mains[0]).getByRole("heading", { name: "Data service unavailable" }),
        ).toBeInTheDocument();
    });

    it("keeps one main landmark and one sidebar while the page loads", () => {
        renderInShell(<Loading />);

        expect(screen.getAllByRole("main")).toHaveLength(1);
        expect(document.querySelectorAll("aside")).toHaveLength(1);
    });
});
