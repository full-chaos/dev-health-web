import { describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";

const cognitive = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
    usePathname: () => "/cognitive-load",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/navigation/ViewSet", () => ({
    ViewSet: () => <div data-testid="view-set" />,
}));
vi.mock("@/components/work/HeatmapView", () => ({
    HeatmapView: () => <div data-testid="heatmap" />,
}));
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: () => <div data-testid="timeseries" />,
}));
vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: () => <div data-testid="bars" />,
}));
vi.mock("@/lib/api/visuals", () => ({ getHeatmap: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { id: "u1", org_id: "org-1" } }),
}));
vi.mock("@/lib/graphql/cognitiveLoadFetchers", () => ({
    getCognitiveLoadViaGraphQL: (...args: unknown[]) => cognitive(...args),
}));

import CognitiveLoadPage from "./page";

const day = (d: string, over: Record<string, number | null> = {}) => ({
    day: d,
    prInterruptionLoad: 6,
    contextSpreadCount: 12,
    reviewRequestLoad: 4,
    afterHoursCommitRatio: null,
    weekendCommitRatio: null,
    ...over,
});

async function renderPage(tab?: string) {
    cognitive.mockResolvedValue({ signals: [day("2026-05-01"), day("2026-05-02")] });
    const ui = await CognitiveLoadPage({ searchParams: Promise.resolve(tab ? { tab } : {}) });
    return render(ui as React.ReactElement);
}

describe("Cognitive Load page header", () => {
    it.each([
        [undefined, "Focus fragmentation, not surveillance."],
        ["heatmap", "Review wait density across hours and weekdays."],
        ["context-switching", "Context spread per day."],
        ["focus-pressure", "Interruptions and review demand over the window."],
        ["load-drivers", "Average daily contribution of each load signal."],
    ])("tab %s has its own subtitle", async (tab, subtitle) => {
        await renderPage(tab);

        expect(within(screen.getByTestId("page-header")).getByText(subtitle)).toBeInTheDocument();
    });

    it("has a View evidence action with the tile values and the driver averages as fact rows", async () => {
        await renderPage();

        await userEvent.click(
            within(screen.getByTestId("page-header")).getByRole("button", {
                name: "View evidence",
            }),
        );
        const rows = within(await screen.findByTestId("page-evidence-facts"))
            .getAllByTestId("evidence-fact")
            .map((row) => row.querySelector("dt")?.textContent);
        expect(rows).toContain("PR interruption load");
        expect(rows).toContain("Context spread");
        expect(rows).toContain("Context spread (avg per day)");
    });

    it("keeps the guardrail: the privacy header is on every tab", async () => {
        await renderPage("context-switching");

        expect(screen.getByTestId("cognitive-load-privacy-header")).toBeInTheDocument();
    });
});
