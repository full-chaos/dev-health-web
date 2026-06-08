import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { QuadrantPanel } from "./QuadrantPanel";

vi.mock("./QuadrantChart", () => ({
    QuadrantChart: () => <div data-testid="quadrant-chart" />,
}));

vi.mock("./InvestigationPanel", () => ({
    InvestigationPanel: () => <div data-testid="investigation-panel" />,
}));

describe("QuadrantPanel", () => {
    const defaultProps = {
        title: "Test Quadrant",
        description: "Test description",
        filters: {
            scope: { level: "repo" as const, ids: [] },
            window: { start: "2026-01-01", end: "2026-01-31" },
            time: { period: "30d" as const, range_days: 30, compare_days: 30 },
            who: {},
            what: {},
            why: {},
            how: {},
        },
        data: {
            axes: {
                x: { metric: "cycle_time", label: "Cycle Time", unit: "days" },
                y: { metric: "throughput", label: "Throughput", unit: "items" },
            },
            points: [
                {
                    entity_id: "team-a",
                    entity_label: "Team A",
                    x: 4.2,
                    y: 18,
                    window_start: "2026-01-01",
                    window_end: "2026-01-31",
                    evidence_link: "/evidence/team-a",
                },
            ],
            annotations: [],
        },
    };

    it("renders the view guide overlay in a portal", () => {
        render(<QuadrantPanel {...defaultProps} showViewGuide={true} />);

        const guideButton = screen.getByRole("button", { name: /view guide/i });
        fireEvent.click(guideButton);

        const dialog = screen.getByRole("dialog");
        expect(dialog).toBeInTheDocument();

        // The dialog should be a direct child of document.body (or inside a portal container in body)
        // In testing-library, baseElement is document.body
        expect(dialog.closest("body")).toBe(document.body);
    });
});
