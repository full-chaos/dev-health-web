import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { getMetricLabel } from "@/lib/metrics/catalog";
import { STATUS_PILL } from "@/lib/statusPill";
import type { MetricFilter } from "@/lib/filters/types";
import type { Experiment } from "@/lib/graphql/types";

import { ExperimentCards } from "./ExperimentCards";

const panel = vi.hoisted(() => vi.fn());
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: (props: { isOpen: boolean; metric?: string; title: string }) => {
        panel(props);
        return props.isOpen ? <div data-testid="evidence-drawer">{props.metric}</div> : null;
    },
}));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const experiments = [
    { id: "e1", hypothesis: "Trial a 24h review SLA", metric: "review_latency" },
    { id: "e2", hypothesis: "Cap WIP per squad", metric: "" },
] as unknown as Experiment[];

describe("ExperimentCards", () => {
    it("wraps the cards in a 'Suggested experiments' section and drops the old sub-line", () => {
        render(<ExperimentCards experiments={experiments} filters={filters} />);

        const section = within(screen.getByTestId("experiments-section"));
        expect(
            section.getByRole("heading", { level: 2, name: "Suggested experiments" }),
        ).toBeInTheDocument();
        expect(section.getAllByTestId("experiment-card")).toHaveLength(2);
        expect(screen.queryByText(/ownership, and stopping criteria/)).toBeNull();
        // Ruling 10: no Owner / Stop condition rows.
        expect(screen.queryByText("Owner")).toBeNull();
        expect(screen.queryByText("Stop condition")).toBeNull();
    });

    it("tags each card with an info pill, numbers the suggestions and titles it by the hypothesis", () => {
        render(<ExperimentCards experiments={experiments} filters={filters} />);

        const first = within(screen.getAllByTestId("experiment-card")[0]);
        expect(first.getByTestId("experiment-metric-pill").className).toContain(STATUS_PILL.info);
        expect(first.getByTestId("experiment-metric-pill")).toHaveTextContent(
            getMetricLabel("review_latency"),
        );
        expect(first.getByTestId("experiment-metric-pill")).not.toHaveTextContent("review_latency");
        expect(first.getByText("Suggestion 1")).toBeInTheDocument();
        expect(
            first.getByRole("heading", { level: 3, name: "Trial a 24h review SLA" }),
        ).toBeInTheDocument();
    });

    it("draws 'Review evidence' as a small ghost button with an arrow that opens the drawer; none without a metric", async () => {
        render(<ExperimentCards experiments={experiments} filters={filters} />);

        const buttons = screen.getAllByRole("button", { name: "Review evidence" });
        expect(buttons).toHaveLength(1);
        expect(buttons[0].querySelector("svg")).not.toBeNull();
        // The arrow comes before the label (prototype btn()).
        expect(buttons[0].firstElementChild?.tagName.toLowerCase()).toBe("span");
        expect(buttons[0].lastChild?.nodeType).toBe(Node.TEXT_NODE);
        expect(buttons[0].className).toContain("text-(--accent-2)");
        await userEvent.click(buttons[0]);
        expect(screen.getByTestId("evidence-drawer")).toHaveTextContent("review_latency");
    });
});
