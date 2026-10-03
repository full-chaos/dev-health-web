import { readFileSync } from "node:fs";
import { join } from "node:path";
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

    describe("overlay checkbox instead of the guide link (CHAOS-8562)", () => {
        it("without an overlay the checkbox is drawn, disabled, with the hint, and there is no guide link", () => {
            render(
                <QuadrantPanel {...defaultProps} showViewGuide={false} alwaysShowOverlayToggle />,
            );
            const box = screen.getByRole("checkbox", { name: "Show interpretive overlay" });
            expect(box).toBeDisabled();
            expect(box).not.toBeChecked();
            expect(
                screen.getByText("Zones appear when two or more entities are in scope."),
            ).toBeInTheDocument();
            expect(screen.queryByRole("button", { name: /view guide/i })).toBeNull();
        });

        it("by default (no prop) a panel with no overlay draws no checkbox", () => {
            render(<QuadrantPanel {...defaultProps} showViewGuide={false} />);
            expect(screen.queryByRole("checkbox")).toBeNull();
        });

        it("the metrics and bottleneck pages ask for the checkbox and drop the guide link", () => {
            for (const file of [
                "src/app/(app)/metrics/page.tsx",
                "src/app/(app)/bottleneck/page.tsx",
            ]) {
                const src = readFileSync(join(process.cwd(), file), "utf8");
                expect(src, file).toMatch(/showViewGuide=\{false\}\s+alwaysShowOverlayToggle/u);
            }
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

        it("default: no chip, and the guide and the related links stay under the head (every other page)", () => {
            render(
                <QuadrantPanel
                    {...defaultProps}
                    relatedLinks={[{ label: "Open evidence", href: "/explore" }]}
                />,
            );
            expect(screen.queryByTestId("quadrant-head-actions")).toBeNull();
            expect(screen.queryByTestId("quadrant-head-hint")).toBeNull();
            expect(
                within(screen.getByTestId("quadrant-controls")).getByRole("button", {
                    name: "View guide",
                }),
            ).toBeInTheDocument();
            const related = screen.getByTestId("quadrant-related-links");
            const head = screen.getByRole("heading", { level: 2 }).closest("div")
                ?.parentElement as HTMLElement;
            expect(head).not.toContainElement(related);
        });

        it("headChip: the chip sits beside the title inside the head, sentence case as given", () => {
            render(
                <QuadrantPanel {...defaultProps} headChip={<span>Primary for this lens</span>} />,
            );
            const title = screen.getByRole("heading", { level: 2, name: "Test Quadrant" });
            const chip = screen.getByText("Primary for this lens");
            expect(title.parentElement).toContainElement(chip);
        });

        it("actionsInHead: View guide and Open evidence are in the card head, right, and not under the chart", async () => {
            render(
                <QuadrantPanel
                    {...defaultProps}
                    actionsInHead
                    relatedLinks={[{ label: "Open evidence", href: "/explore" }]}
                />,
            );
            const actions = screen.getByTestId("quadrant-head-actions");
            const head = actions.parentElement as HTMLElement;
            expect(within(head).getByRole("heading", { level: 2 })).toBeInTheDocument();
            expect(within(actions).getByRole("button", { name: "View guide" })).toBeInTheDocument();
            expect(within(actions).getByRole("link", { name: "Open evidence" })).toHaveAttribute(
                "href",
                "/explore",
            );
            // Bordered buttons, icon first, as the concept draws them (default pages keep ghost).
            for (const el of [
                within(actions).getByRole("button", { name: "View guide" }),
                within(actions).getByRole("link", { name: "Open evidence" }),
            ]) {
                expect(el.className).toContain("border-(--card-stroke)");
                expect(el.className).not.toContain("border-transparent");
                expect(el.firstElementChild?.tagName.toLowerCase()).toBe("svg");
            }
            // The caption sits in the head, left of the buttons, sentence case.
            const hint = within(actions).getByText("Select a dot to investigate");
            expect(hint.className).not.toMatch(/uppercase|tracking-/);
            expect(
                hint.compareDocumentPosition(
                    within(actions).getByRole("button", { name: "View guide" }),
                ) & Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
            // Each exists once: nothing is repeated under the chart.
            expect(screen.getAllByRole("button", { name: "View guide" })).toHaveLength(1);
            expect(screen.getAllByRole("link", { name: "Open evidence" })).toHaveLength(1);
            expect(
                within(screen.getByTestId("quadrant-controls")).queryByRole("button", {
                    name: "View guide",
                }),
            ).toBeNull();
            // The guide still opens from the head.
            fireEvent.click(within(actions).getByRole("button", { name: "View guide" }));
            expect(screen.getByRole("dialog")).toBeInTheDocument();
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
