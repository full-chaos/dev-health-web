import { describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";

const graphql = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
    usePathname: () => "/complexity",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/navigation/ViewSet", () => ({
    ViewSet: () => <div data-testid="view-set" />,
}));
vi.mock("@/components/work/FlameView", () => ({ FlameView: () => <div data-testid="flame" /> }));
vi.mock("@/components/complexity/ComplexityDashboard", () => ({
    ComplexityDashboard: () => <div data-testid="complexity-dashboard" />,
}));
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/graphql/server", () => ({ graphqlFetch: (...args: unknown[]) => graphql(...args) }));

import ComplexityPage from "./page";

const point = (scopeId: string, date: string, perKloc: number, high: number) => ({
    scopeId,
    date,
    cyclomaticPerKloc: perKloc,
    highComplexityFunctions: high,
});

async function renderPage(tab?: string) {
    graphql.mockImplementation(async (query: string) =>
        String(query).includes("hotspots")
            ? { hotspots: { rows: [{ filePath: "a.py", riskScore: 0.8 }] } }
            : {
                  complexityTimeseries: {
                      points: [point("r1", "2026-01-01", 5, 2), point("r1", "2026-01-08", 7, 3)],
                      totalScope: 1,
                  },
              },
    );
    const ui = await ComplexityPage({
        searchParams: Promise.resolve(tab ? { tab } : {}),
    });
    return render(ui as React.ReactElement);
}

describe("Complexity page header", () => {
    it.each([
        [undefined, "Code complexity over time, file hotspots, and high-risk areas."],
        ["flame", "Analyze decomposition and bottlenecks in this surface."],
        ["hotspots", "Files sized by risk score and grouped by repository."],
        ["ownership-risk", "Files ranked by blame concentration."],
        ["churn", "Files ranked by lines changed over the last 30 days."],
    ])("tab %s has its own subtitle", async (tab, subtitle) => {
        await renderPage(tab);

        expect(within(screen.getByTestId("page-header")).getByText(subtitle)).toBeInTheDocument();
    });

    it("has a View evidence action with the overview tile values as fact rows", async () => {
        await renderPage();

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
            ["Avg Complexity", "7 cyclomatic / kloc"],
            ["Rising Areas", "1"],
            ["High-Complexity Functions", "3"],
            ["Hotspot Files", "1"],
        ]);
    });
});
