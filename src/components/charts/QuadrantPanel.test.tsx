import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, fireEvent, waitFor, within } from "@/test/utils";
import { QuadrantPanel } from "./QuadrantPanel";

vi.mock("./QuadrantChart", () => ({
    QuadrantChart: () => <div data-testid="quadrant-chart" />,
}));

vi.mock("./InvestigationPanel", () => ({
    InvestigationPanel: () => <div data-testid="investigation-panel" />,
}));

describe("QuadrantPanel", () => {
    beforeAll(() => {
        // The panel reads zone colors from the theme store, which watches the color scheme.
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: () => ({
                matches: false,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            }),
        });
    });

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

    describe("card head (shared Section look, optional action)", () => {
        const action = <a href="/explore?metric=cycle_time">Metric evidence</a>;

        it("draws the title as the card's h2 with the description under it", () => {
            render(<QuadrantPanel {...defaultProps} />);
            const card = screen.getByTestId("quadrant-panel");
            const title = within(card).getByRole("heading", { level: 2, name: "Test Quadrant" });
            expect(title.className).toContain("text-h3");
            expect(title.className).toContain("font-semibold");
            const description = within(card).getByText("Test description");
            expect(description.className).toContain("text-xs");
            expect(
                title.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
            // The legacy card look is gone.
            expect(card.className).toContain("rounded-(--radius-md)");
            expect(card.className).not.toContain("rounded-3xl");
            expect(title.className).not.toContain("text-xl");
        });

        it("has ONE action in the head: the caller's; the guide is a ghost small button in the control row under it", () => {
            render(<QuadrantPanel {...defaultProps} action={action} showViewGuide={true} />);
            const slot = screen.getByTestId("quadrant-panel-action");
            const link = within(slot).getByRole("link", { name: "Metric evidence" });
            expect(link).toHaveAttribute("href", "/explore?metric=cycle_time");
            // The head row holds the title block and the action slot, nothing else.
            const head = slot.parentElement as HTMLElement;
            expect(Array.from(head.children)).toHaveLength(2);
            expect(within(head).queryByRole("button", { name: /view guide/i })).toBeNull();

            const controls = screen.getByTestId("quadrant-controls");
            const guide = within(controls).getByRole("button", { name: "View guide" });
            expect(guide.className).toContain("border-transparent");
            expect(guide.className).toContain("min-h-7");
            expect(guide.className).not.toContain("uppercase");
            // The icon comes before the text.
            expect(guide.firstElementChild?.tagName.toLowerCase()).toBe("svg");
            expect(
                head.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        });

        it("draws no upper-case dot hint in the head (the note under the chart says it)", () => {
            render(<QuadrantPanel {...defaultProps} action={action} />);
            expect(screen.queryByText(/select a dot to investigate$/i)).toBeNull();
            expect(
                screen.getByText("Select a dot in the chart above to investigate patterns."),
            ).toBeInTheDocument();
        });

        it("draws a related link as a ghost small button with the arrow first, not an upper-case pill", () => {
            render(
                <QuadrantPanel
                    {...defaultProps}
                    relatedLinks={[{ label: "Explore work", href: "/work" }]}
                />,
            );
            const link = within(screen.getByTestId("quadrant-related-links")).getByRole("link", {
                name: "Explore work",
            });
            expect(link).toHaveAttribute("href", "/work");
            expect(link.className).toContain("border-transparent");
            expect(link.className).not.toContain("uppercase");
            expect(link.firstElementChild?.tagName.toLowerCase()).toBe("svg");
        });

        it("draws no action slot when the caller gives none", () => {
            render(<QuadrantPanel {...defaultProps} />);
            expect(screen.queryByTestId("quadrant-panel-action")).toBeNull();
        });

        it("keeps the title, description and action when there are no points: an explicit empty state", () => {
            render(
                <QuadrantPanel
                    {...defaultProps}
                    data={null}
                    emptyState="Quadrant data unavailable for this scope."
                    action={action}
                />,
            );
            const card = screen.getByTestId("quadrant-panel");
            expect(card).toHaveAttribute("data-empty", "true");
            expect(
                within(card).getByRole("heading", { level: 2, name: "Test Quadrant" }),
            ).toBeInTheDocument();
            expect(within(card).getByText("Test description")).toBeInTheDocument();
            expect(within(card).getByRole("link", { name: "Metric evidence" })).toBeInTheDocument();
            expect(within(card).getByTestId("quadrant-empty")).toHaveTextContent(
                "Quadrant data unavailable for this scope.",
            );
            // No chart, no dot prompt and no invented point.
            expect(screen.queryByTestId("quadrant-chart")).toBeNull();
            expect(screen.queryByText(/select a dot/i)).toBeNull();
        });

        it("treats an empty point list like no data", () => {
            render(
                <QuadrantPanel
                    {...defaultProps}
                    data={{ ...defaultProps.data, points: [] }}
                    emptyState="Nothing to plot."
                />,
            );
            expect(screen.getByTestId("quadrant-panel")).toHaveAttribute("data-empty", "true");
            expect(screen.getByTestId("quadrant-empty")).toHaveTextContent("Nothing to plot.");
            expect(screen.queryByTestId("quadrant-chart")).toBeNull();
        });
    });
});
