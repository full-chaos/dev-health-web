import { describe, expect, it } from "vitest";
import { render, screen, within } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";

import { OverviewView, type LoadKpi } from "./CognitiveLoadViews";

// Pins of the Overview tile as it is today (CHAOS-7750): green before the fold into MetricCard
// and kept green after it.

const filters = {
    scope: { level: "team" as const, ids: ["team-1"] },
    time: { range_days: 30 },
    what: { repos: [] },
} as unknown as MetricFilter;
const window = { sinceDate: "2026-05-01", untilDate: "2026-05-31" };
const kpi = (over: Partial<LoadKpi> = {}): LoadKpi => ({
    label: "Review request load",
    value: "11.5",
    delta: "avg over 31 days",
    deltaTone: "text-(--negative)",
    interpretation: "Rising",
    description: "Review requests that interrupt focused delivery.",
    ...over,
});
const tiles = () => screen.getAllByTestId("cognitive-load-tile");
const renderTiles = (signals: LoadKpi[]) =>
    render(<OverviewView signals={signals} window={window} filters={filters} trend={[]} />);

describe("Cognitive Load Overview tile (pins)", () => {
    it("is an article with the test id, one per signal, in the signal order", () => {
        renderTiles([kpi(), kpi({ label: "Context spread" }), kpi({ label: "Weekend work" })]);
        expect(tiles()).toHaveLength(3);
        for (const tile of tiles()) expect(tile.tagName).toBe("ARTICLE");
        expect(tiles().map((t) => within(t).getByText(/load|spread|work/i).textContent)).toEqual([
            "Review request load",
            "Context spread",
            "Weekend work",
        ]);
    });

    it("shows the label, the value string, the chip, the period text and the description", () => {
        renderTiles([kpi()]);
        const tile = within(tiles()[0]);
        expect(tile.getByText("Review request load")).toBeInTheDocument();
        expect(tile.getByText("11.5")).toBeInTheDocument();
        expect(tile.getByText("Rising")).toBeInTheDocument();
        expect(tile.getByText("avg over 31 days")).toBeInTheDocument();
        expect(
            tile.getByText("Review requests that interrupt focused delivery."),
        ).toBeInTheDocument();
    });

    it("shows a missing value as the page's em dash string and never as 0", () => {
        renderTiles([kpi({ value: "—", interpretation: "N/A" })]);
        const tile = within(tiles()[0]);
        expect(tile.getByText("—")).toBeInTheDocument();
        expect(tile.queryByText("0")).toBeNull();
        expect(tile.queryByText("--")).toBeNull();
    });

    it("puts the chip before the period text, which keeps the page's tone class", () => {
        renderTiles([kpi()]);
        const tile = within(tiles()[0]);
        const chip = tile.getByText("Rising");
        const period = tile.getByText("avg over 31 days");
        expect(
            chip.compareDocumentPosition(period) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(period.className).toContain("text-(--negative)");
    });

    it("has no trend text, no sparkline, no link and no Open evidence cue", () => {
        renderTiles([kpi()]);
        const tile = within(tiles()[0]);
        expect(tile.queryByText(/trend/i)).toBeNull();
        expect(tile.queryByRole("link")).toBeNull();
        expect(tile.queryByRole("button")).toBeNull();
        expect(tile.queryByText(/open evidence/i)).toBeNull();
    });
});
