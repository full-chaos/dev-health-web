import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import userEvent from "@testing-library/user-event";

import { ImproveAutomationsDashboard } from "./ImproveAutomationsDashboard";

const hook = vi.hoisted(() => vi.fn());
vi.mock("@/lib/graphql/hooks/useImproveOpportunities", () => ({
    useImproveOpportunities: () => hook(),
}));

const item = (over: Record<string, unknown> = {}) => ({
    opportunityId: "o1",
    kind: "HIGH_REVIEW_LATENCY",
    entityType: "team",
    entityId: "3f2a9c1e-1111-4222-8333-444455556666",
    title: "Review latency is high",
    rationale: "Median first-review time was 52.0 h over the last 30 days (threshold: 48 h).",
    severity: "high",
    score: 0.8,
    recommendedAction: "Add a second reviewer rota",
    evidenceRefs: ["review_latency", "cycle_time"],
    ...over,
});

const result = (over: Record<string, unknown> = {}) => ({
    data: {
        improveOpportunities: {
            detectorReady: true,
            totalCount: 3,
            opportunities: [item()],
            ...over,
        },
    },
    fetching: false,
    error: undefined,
    retry: vi.fn(),
});

const tiles = () => within(screen.getByTestId("improve-automations-tiles"));
const AI = "/ai/automations?f=x";

describe("ImproveAutomationsDashboard", () => {
    it("shows the detected count and one count per kind present, from the list", () => {
        hook.mockReturnValue(
            result({
                totalCount: 3,
                opportunities: [
                    item(),
                    item({ opportunityId: "o2", entityId: "repo-web" }),
                    item({ opportunityId: "o3", kind: "HIGH_CHURN", entityId: "repo-ops" }),
                ],
            }),
        );
        render(<ImproveAutomationsDashboard aiAutomationsHref={AI} />);

        expect(tiles().getByText("Detected signals")).toBeInTheDocument();
        expect(tiles().getByText("3")).toBeInTheDocument();
        expect(tiles().getByText("High review latency")).toBeInTheDocument();
        expect(tiles().getByText("2")).toBeInTheDocument();
        expect(tiles().getByText("High churn")).toBeInTheDocument();
        expect(tiles().queryByText("High WIP")).toBeNull();
    });

    it("shows a table with Captured entity, Value and Threshold columns; Value and Threshold read Not reported until they are served", () => {
        hook.mockReturnValue(result());
        render(<ImproveAutomationsDashboard aiAutomationsHref={AI} />);

        const table = within(screen.getByTestId("improve-automations-table"));
        expect(table.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
            "Signal",
            "Captured entity",
            "Value",
            "Threshold",
            "Severity",
            "Detail",
            "Recommended",
            "Evidence",
        ]);
        const row = within(screen.getByTestId("improve-automations-row"));
        expect(row.getByText("High review latency")).toHaveAttribute(
            "title",
            "Review latency is high",
        );
        expect(row.getByTestId("detection-value")).toHaveTextContent("Not reported");
        expect(row.getByTestId("detection-threshold")).toHaveTextContent("Not reported");
        expect(row.getByText(/threshold: 48 h/)).toBeInTheDocument();
        expect(row.getByText("Add a second reviewer rota")).toBeInTheDocument();
        // The raw references are not in the row any more: they are in the drawer (next test).
        expect(row.queryByText("review_latency · cycle_time")).toBeNull();
        expect(row.getByRole("button", { name: /Evidence/ })).toBeInTheDocument();
    });

    it("draws the tiles as one joined strip and the candidates as a Section with a ghost AI link", () => {
        hook.mockReturnValue(result());
        render(<ImproveAutomationsDashboard aiAutomationsHref={AI} />);

        expect(screen.getByTestId("improve-automations-tiles")).toHaveAttribute(
            "data-columns",
            "2",
        );
        // A count has no prior period to compare: no "No prior period" noise on the tiles.
        expect(tiles().queryByText(/No prior period/)).toBeNull();
        const panel = within(screen.getByTestId("improve-automations-flow-panel"));
        expect(
            panel.getByRole("heading", { level: 2, name: "Automation candidates" }),
        ).toBeInTheDocument();
        expect(
            panel
                .getByTestId("improve-automations-head-link")
                .firstElementChild?.tagName.toLowerCase(),
        ).toBe("svg");
        expect(panel.getByTestId("improve-automations-head-link").className).toContain(
            "text-(--accent-2)",
        );
    });

    it("opens the shared drawer from the row's Evidence button with the detection and each reference as fact rows", async () => {
        hook.mockReturnValue(result());
        render(<ImproveAutomationsDashboard aiAutomationsHref={AI} />);

        await userEvent.click(screen.getByTestId("detection-evidence-button"));

        const rows = within(await screen.findByTestId("detection-evidence-facts"))
            .getAllByTestId("evidence-fact")
            .map((row) => [
                row.querySelector("dt")?.textContent,
                row.querySelector("dd")?.textContent,
            ]);
        expect(rows).toContainEqual(["Signal", "High review latency"]);
        expect(rows).toContainEqual(["Severity", "high"]);
        expect(rows).toContainEqual(["Recommended", "Add a second reviewer rota"]);
        expect(rows).toContainEqual(["Evidence reference 1", "review_latency"]);
        expect(rows).toContainEqual(["Evidence reference 2", "cycle_time"]);
    });

    it("says 'Not reported' for a detection with no evidence references", async () => {
        hook.mockReturnValue(result({ opportunities: [item({ evidenceRefs: [] })] }));
        render(<ImproveAutomationsDashboard aiAutomationsHref={AI} />);

        await userEvent.click(screen.getByTestId("detection-evidence-button"));

        const row = within(await screen.findByTestId("detection-evidence-facts"))
            .getByText("Evidence references")
            .closest("[data-testid='evidence-fact']");
        expect(row).toHaveTextContent("Not reported");
    });

    it("writes severity as a word with an icon", () => {
        hook.mockReturnValue(result());
        render(<ImproveAutomationsDashboard aiAutomationsHref={AI} />);

        const pill = screen.getByText("high");
        expect(pill.querySelector("svg")).not.toBeNull();
    });

    it("shows a short token and Unresolved for an id without a name, the full id in the tooltip", () => {
        hook.mockReturnValue(
            result({
                opportunities: [item(), item({ opportunityId: "o2", entityId: "repo-web" })],
            }),
        );
        render(<ImproveAutomationsDashboard aiAutomationsHref={AI} />);

        const rows = screen.getAllByTestId("improve-automations-row");
        expect(rows[0]).toHaveTextContent("#3f2a9c1e · Unresolved");
        const raw = within(rows[0]).getByText(/Unresolved/);
        expect(raw).toHaveAttribute("title", "3f2a9c1e-1111-4222-8333-444455556666");
        expect(rows[0]).not.toHaveTextContent("3f2a9c1e-1111-4222-8333-444455556666");
        // A readable name is shown as is.
        expect(within(rows[1]).getByText(/repo-web/)).toBeInTheDocument();
        expect(rows[1]).not.toHaveTextContent("Unresolved");
    });

    it("shows unavailable counts as -- and the dashed unavailable state when the detector is not ready", () => {
        hook.mockReturnValue(result({ detectorReady: false, totalCount: 0, opportunities: [] }));
        render(<ImproveAutomationsDashboard aiAutomationsHref={AI} />);

        expect(tiles().getByText("--")).toBeInTheDocument();
        expect(tiles().queryByText("0")).toBeNull();
        const box = screen.getByTestId("improve-automations-unavailable");
        expect(box).toHaveTextContent("No flow opportunities detected");
        expect(box).toHaveTextContent("candidates will appear here automatically");
        expect(screen.queryByTestId("improve-automations-table")).toBeNull();
    });

    it("shows a real 0 and the neutral empty state when the detector ran and found nothing", () => {
        hook.mockReturnValue(result({ totalCount: 0, opportunities: [] }));
        render(<ImproveAutomationsDashboard aiAutomationsHref={AI} />);

        expect(tiles().getByText("0")).toBeInTheDocument();
        expect(tiles().queryByText("--")).toBeNull();
        const box = screen.getByTestId("improve-automations-empty");
        expect(box).toHaveTextContent("All monitored metrics are within thresholds.");
    });

    it("shows a load error as an error with Retry that runs the query again", async () => {
        const retry = vi.fn();
        hook.mockReturnValue({ data: undefined, fetching: false, error: new Error("boom"), retry });
        render(<ImproveAutomationsDashboard aiAutomationsHref={AI} />);

        const box = screen.getByTestId("improve-automations-error");
        expect(box).toHaveAttribute("data-variant", "error");
        expect(box).toHaveTextContent("Flow opportunities could not load");
        await userEvent.click(within(box).getByRole("button", { name: "Retry" }));
        expect(retry).toHaveBeenCalledTimes(1);
    });

    it("shows a skeleton of tiles and table while loading", () => {
        hook.mockReturnValue({ data: undefined, fetching: true, error: undefined, retry: vi.fn() });
        render(<ImproveAutomationsDashboard aiAutomationsHref={AI} />);

        expect(screen.getByTestId("improve-automations-loading")).toBeInTheDocument();
    });

    it("links to the AI automations from the card head and from the foot notice", () => {
        hook.mockReturnValue(result());
        render(<ImproveAutomationsDashboard aiAutomationsHref={AI} />);

        expect(screen.getByTestId("improve-automations-head-link")).toHaveAttribute("href", AI);
        expect(screen.getByTestId("improve-automations-ai-link")).toHaveAttribute("href", AI);
        expect(screen.getByTestId("improve-automations-ai-crosslink")).toHaveTextContent(
            "Looking for AI-workflow automation opportunities?",
        );
    });
});
