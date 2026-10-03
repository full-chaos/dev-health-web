import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";

import { requireSession } from "@/lib/auth";
import { getAIWorkflowDrilldownViaGraphQL } from "@/lib/graphql/workGraphFetchers";

import IssueDetailPage from "./page";

// The issue detail page inside the shared app shell. Diagnose owns the
// route; the page reads no query param and keeps "Back to Explore".

const DEFAULT_F = encodeFilterParam(defaultMetricFilter);

vi.mock("next/navigation", () => ({
    usePathname: () => "/issues/x-1",
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
    getAIWorkflowDrilldownViaGraphQL: vi.fn().mockResolvedValue({
        orgId: "org-1",
        rootType: "ISSUE",
        rootId: "x-1",
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
                {await IssueDetailPage({ params: Promise.resolve({ issue_id: "x-1" }) })}
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Issue detail in the shared app shell", () => {
    it("has one main, one h1 'Flame Diagram' and the subtitle", async () => {
        await renderPage();

        expect(screen.getAllByRole("main")).toHaveLength(1);
        const headings = screen.getAllByRole("heading", { level: 1 });
        expect(headings).toHaveLength(1);
        expect(headings[0]).toHaveTextContent("Flame Diagram");
        expect(
            within(screen.getByTestId("page-header")).getByText(
                "Track backlog wait time versus active work time.",
            ),
        ).toBeInTheDocument();
    });

    it("keeps 'Back to Explore' and names the artifact: the trail is the area only", async () => {
        await renderPage();

        const header = within(screen.getByTestId("page-header"));
        expect(header.getByRole("link", { name: "Back to Explore" })).toHaveAttribute(
            "href",
            "/explore",
        );
        expect(header.getByText("Issue")).toBeInTheDocument();
        const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
        expect(trail).toHaveTextContent("Diagnose");
        expect(within(trail).queryAllByRole("link")).toHaveLength(0);
    });

    it("marks the Diagnose area and no destination, and the links carry the default metric filter", async () => {
        await renderPage();

        expect(
            screen.getByTestId("nav-children-diagnose").querySelectorAll('a[aria-current="page"]'),
        ).toHaveLength(0);
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

describe("Issue detail org scope (CHAOS-8272)", () => {
    it("makes no request when the session has no org", async () => {
        vi.mocked(requireSession).mockResolvedValueOnce({ user: {} } as never);
        vi.mocked(getAIWorkflowDrilldownViaGraphQL).mockClear();
        await renderPage();
        expect(getAIWorkflowDrilldownViaGraphQL).not.toHaveBeenCalled();
    });
});
