import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";

const graphql = vi.hoisted(() => vi.fn());
const heatmapRead = vi.hoisted(() => vi.fn());
const explainRead = vi.hoisted(() => vi.fn());
const dashboardProps = vi.hoisted(() => ({
    last: undefined as Record<string, unknown> | undefined,
}));
const session = vi.hoisted(() => vi.fn());

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
    ComplexityDashboard: (props: Record<string, unknown>) => {
        dashboardProps.last = props;
        return <div data-testid="complexity-dashboard" />;
    },
}));
vi.mock("@/lib/auth", () => ({
    requireSession: () => session(),
}));
vi.mock("@/lib/api/visuals", () => ({ getHeatmap: (...a: unknown[]) => heatmapRead(...a) }));
vi.mock("@/lib/api/home", () => ({ getExplainData: (...a: unknown[]) => explainRead(...a) }));
vi.mock("@/lib/graphql/server", () => ({ graphqlFetch: (...args: unknown[]) => graphql(...args) }));

import ComplexityPage from "./page";

const point = (scopeId: string, date: string, perKloc: number, high: number) => ({
    scopeId,
    date,
    cyclomaticPerKloc: perKloc,
    highComplexityFunctions: high,
});

beforeEach(() => {
    vi.clearAllMocks();
    dashboardProps.last = undefined;
    session.mockResolvedValue({ user: { org_id: "org-1" } });
    explainRead.mockResolvedValue({ contributors: [] });
    heatmapRead.mockResolvedValue({ axes: { x: ["a"], y: ["b"] }, cells: [] });
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
    ])("tab %s has its own subtitle, as the one line under the title", async (tab, subtitle) => {
        await renderPage(tab);

        const header = screen.getByTestId("page-header");
        expect(within(header).getByText(subtitle)).toBeInTheDocument();
        // Prototype views 17 to 21: one subtitle line (no second "Every score traces…" line).
        const lines = Array.from(
            header.querySelectorAll("p:not([data-testid='page-header-eyebrow'])"),
        ).map((line) => line.textContent);
        expect(lines).toEqual([subtitle]);
        expect(within(header).queryByText(/Every score traces/u)).toBeNull();
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

describe("Complexity page hotspot heatmap read (moved from the Code page)", () => {
    const heatmapState = () =>
        (dashboardProps.last?.hotspotHeatmap as { state: string } | undefined)?.state;

    it("reads the risk heatmap on the hotspots tab with a session org", async () => {
        await renderPage("hotspots");
        expect(heatmapRead).toHaveBeenCalledTimes(1);
        expect(heatmapRead.mock.calls[0][0]).toMatchObject({
            type: "risk",
            metric: "hotspot_risk",
        });
        expect(heatmapState()).toBe("ok");
    });

    it("marks a failed read as failed, not as empty", async () => {
        heatmapRead.mockRejectedValue(new Error("boom"));
        await renderPage("hotspots");
        expect(heatmapState()).toBe("failed");
    });

    it("makes no read without a session org", async () => {
        session.mockResolvedValue({ user: {} });
        await renderPage("hotspots");
        expect(heatmapRead).not.toHaveBeenCalled();
        expect(explainRead).not.toHaveBeenCalled();
    });

    it("makes no read on the other tabs", async () => {
        await renderPage();
        expect(heatmapRead).not.toHaveBeenCalled();
        expect(dashboardProps.last?.hotspotHeatmap).toBeUndefined();
    });
});
