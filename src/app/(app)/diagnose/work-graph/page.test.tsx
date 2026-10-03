import { describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";

const reviewEdges = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
    usePathname: () => "/diagnose/work-graph",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/navigation/ViewSet", () => ({
    ViewSet: () => <div data-testid="view-set" />,
}));
vi.mock("@/components/work/GraphView", () => ({
    GraphView: () => <div data-testid="graph-view" />,
}));
vi.mock("@/components/work/WorkGraphEvidenceAction", () => ({
    WorkGraphEvidenceAction: ({ activeTab }: { activeTab: string }) =>
        activeTab === "inflow-outflow" || activeTab === "artifacts" ? (
            <button type="button">View evidence</button>
        ) : null,
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/graphql/reviewEdgesFetchers", () => ({
    getReviewEdgesViaGraphQL: (...args: unknown[]) => reviewEdges(...args),
}));

import WorkGraphPage from "./page";

async function renderPage(tab?: string) {
    reviewEdges.mockResolvedValue({
        totalCount: 3,
        edges: [
            { reviewer: "a@x", author: "c@x", reviewsCount: 5, day: "2026-05-01" },
            { reviewer: "b@x", author: "c@x", reviewsCount: 2, day: "2026-05-01" },
        ],
    });
    const ui = await WorkGraphPage({ searchParams: Promise.resolve(tab ? { tab } : {}) });
    return render(ui as React.ReactElement);
}

describe("Work Graph page header", () => {
    it.each([
        [
            undefined,
            "Relationship topology across work, pull requests, code, releases, incidents, and evidence-bearing artifacts.",
        ],
        ["inflow-outflow", "How relationships flow into and out of each entity type."],
        ["review-network", "Reviewer-to-author collaboration pairs from code review activity."],
        ["artifacts", "Entities ranked by how many relationships they carry."],
    ])("tab %s has its own subtitle", async (tab, subtitle) => {
        await renderPage(tab);

        expect(within(screen.getByTestId("page-header")).getByText(subtitle)).toBeInTheDocument();
    });

    it("Review Network has a View evidence action with the served totals and no names", async () => {
        await renderPage("review-network");

        await userEvent.click(
            within(screen.getByTestId("page-header")).getByRole("button", {
                name: "View evidence",
            }),
        );
        const rows = within(await screen.findByTestId("page-evidence-facts"))
            .getAllByTestId("evidence-fact")
            .map((row) => [
                row.querySelector("dt")?.textContent,
                row.querySelector("dd")?.textContent,
            ]);
        expect(rows).toEqual([
            ["Reviewers", "2"],
            ["Authors", "1"],
            ["Total reviews", "7"],
        ]);
    });

    it.each(["inflow-outflow", "artifacts"])(
        "tab %s has the page-head View evidence action",
        async (tab) => {
            await renderPage(tab);

            expect(
                within(screen.getByTestId("page-header")).getByRole("button", {
                    name: "View evidence",
                }),
            ).toBeInTheDocument();
        },
    );

    it("keeps the Open evidence link on the Overview, with the arrow first", async () => {
        await renderPage();

        const link = within(screen.getByTestId("page-header")).getByRole("link", {
            name: "Open evidence",
        });
        expect(link.firstElementChild?.tagName.toLowerCase()).toBe("svg");
        expect(screen.queryByRole("button", { name: "View evidence" })).toBeNull();
    });
});
