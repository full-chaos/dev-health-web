import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@/test/utils";
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

        // Regression (CHAOS-2161): the dialog must stack ABOVE the bg-black/50
        // backdrop (an absolute-positioned sibling), not behind it.
        expect(dialog).toHaveClass("relative");
        expect(dialog.className).toMatch(/\bz-10\b/);
    });

    it("closes the guide when Escape is pressed", async () => {
        render(<QuadrantPanel {...defaultProps} showViewGuide={true} />);
        const guideButton = screen.getByRole("button", { name: /view guide/i });
        fireEvent.click(guideButton);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        fireEvent.keyDown(window, { key: "Escape" });
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });

    it("moves focus into the dialog when opened", async () => {
        render(<QuadrantPanel {...defaultProps} showViewGuide={true} />);
        const guideButton = screen.getByRole("button", { name: /view guide/i });
        fireEvent.click(guideButton);
        const dialog = screen.getByRole("dialog");
        await waitFor(() => {
            expect(dialog.contains(document.activeElement)).toBe(true);
        });
    });

    it("restores focus to the trigger button when the dialog is closed", async () => {
        render(<QuadrantPanel {...defaultProps} showViewGuide={true} />);
        const guideButton = screen.getByRole("button", { name: /view guide/i });
        fireEvent.click(guideButton);
        const dialog = screen.getByRole("dialog");
        const closeButton = within(dialog).getByRole("button");
        fireEvent.click(closeButton);
        await waitFor(() => {
            expect(document.activeElement).toBe(guideButton);
        });
    });
});
