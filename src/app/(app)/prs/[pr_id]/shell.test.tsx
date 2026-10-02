import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";

import PrDetailPage from "./page";

// The PR detail page inside the shared app shell. Diagnose owns the route
// (it is opened from Explore, the heatmaps and the Work Graph). The page reads
// no query param and keeps "Back to Explore".

const fetchers = vi.hoisted(() => ({ prDetail: vi.fn() }));
const DEFAULT_F = encodeFilterParam(defaultMetricFilter);

vi.mock("next/navigation", () => ({
    usePathname: () => "/prs/repo-1%3A42",
    useSearchParams: () => new URLSearchParams(""),
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
vi.mock("@/components/charts/FlameDiagram", () => ({ FlameDiagram: () => null }));
vi.mock("@/components/work/RelatedEntitiesPanel", () => ({
    RelatedEntitiesPanel: () => <div data-testid="related-entities" />,
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/api/visuals", () => ({ getFlame: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/graphql/workGraphFetchers", () => ({
    getPrDetailViaGraphQL: (...args: unknown[]) => fetchers.prDetail(...args),
    getAIWorkflowDrilldownViaGraphQL: vi.fn().mockResolvedValue({
        orgId: "org-1",
        rootType: "PR",
        rootId: "repo-1:42",
        nodes: [],
        edges: [],
        evidence: [],
    }),
    getWorkUnitInvestmentDistribution: vi.fn(),
}));

async function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                {await PrDetailPage({ params: Promise.resolve({ pr_id: "repo-1%3A42" }) })}
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    fetchers.prDetail.mockReset();
    fetchers.prDetail.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("PR detail in the shared app shell", () => {
    it.each([
        ["the page", () => fetchers.prDetail.mockResolvedValue(null)],
        ["the backend error state", () => fetchers.prDetail.mockRejectedValue(new Error("down"))],
    ])("%s: one main, one h1, the title and the subtitle", async (_label, arrange) => {
        arrange();
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("PR detail");
        expect(
            within(screen.getByTestId("page-header")).getByText(
                "Review persisted PR details, reviews, commits, and Work Graph evidence.",
            ),
        ).toBeInTheDocument();
        expect(document.querySelectorAll("aside")).toHaveLength(1);
    });

    it("keeps 'Back to Explore' and names the artifact: the trail is the area only", async () => {
        await renderPage();

        const header = within(screen.getByTestId("page-header"));
        expect(header.getByRole("link", { name: "Back to Explore" })).toHaveAttribute(
            "href",
            "/explore",
        );
        expect(header.getByText("Pull Request")).toBeInTheDocument();
        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(trail).toHaveTextContent("Diagnose");
        expect(within(trail).queryAllByRole("link")).toHaveLength(0);
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent("Diagnose");
    });

    it("marks the Diagnose area in the sidebar and no Diagnose destination", async () => {
        await renderPage();

        const children = screen.getByTestId("nav-children-diagnose");
        expect(children.querySelectorAll('a[aria-current="page"]')).toHaveLength(0);
        expect(screen.getByRole("link", { name: /^Diagnose$/ }).getAttribute("data-active")).toBe(
            "true",
        );
    });

    it("gives every sidebar link the default metric filter, as the page-level navigation did", async () => {
        await renderPage();

        const links = within(screen.getByRole("navigation", { name: "Primary areas" }))
            .getAllByRole("link")
            .filter((link) => (link.getAttribute("href") ?? "").includes("f="));
        expect(links.length).toBeGreaterThan(5);
        for (const link of links) {
            const url = new URL(link.getAttribute("href") ?? "", "https://app.example");
            expect(url.searchParams.get("f"), url.pathname).toBe(DEFAULT_F);
        }
    });
});
