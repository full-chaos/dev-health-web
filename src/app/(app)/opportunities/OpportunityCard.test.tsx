import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, within } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OpportunityCard, metricFromEvidenceLink } from "./OpportunityCard";
import type { MetricFilter } from "@/lib/filters/types";
import type { OpportunityCard as OpportunityCardData } from "@/lib/types";

const panel = vi.hoisted(() => vi.fn());
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: (props: { isOpen: boolean; apiUrl?: string; title: string }) => {
        panel(props);
        return props.isOpen ? <div data-testid="evidence-drawer">{props.apiUrl}</div> : null;
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

const reduceReviewLatency: OpportunityCardData = {
    id: "reduce-review-latency",
    title: "Reduce Review Latency",
    rationale: "Review wait time appears to lengthen cycle time in this window.",
    evidence_links: ["/api/v1/explain?metric=review_latency", "/api/v1/explain?metric=cycle_time"],
    suggested_experiments: [
        "Trial a 24h review SLA for the auth squad",
        "Add a second reviewer to the on-call rota",
    ],
};

describe("OpportunityCard (the selected opportunity)", () => {
    it("shows the rationale sentence as it comes and numbered next steps, never as evidence", () => {
        render(<OpportunityCard card={reduceReviewLatency} filters={filters} activeRole="eng" />);

        expect(
            within(screen.getByTestId("opportunity-captured-change")).getByText(
                "Review wait time appears to lengthen cycle time in this window.",
            ),
        ).toBeInTheDocument();
        const steps = within(screen.getByTestId("opportunity-card-next-step"));
        expect(steps.getByText("Suggested next steps")).toBeInTheDocument();
        expect(steps.getAllByRole("listitem")).toHaveLength(2);
        const evidence = screen.getByTestId("opportunity-card-evidence");
        expect(within(evidence).queryByText(/24h review SLA/)).not.toBeInTheDocument();
    });

    it("opens the shared evidence drawer on the first evidence link", async () => {
        render(<OpportunityCard card={reduceReviewLatency} filters={filters} activeRole="eng" />);

        expect(screen.queryByTestId("evidence-drawer")).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "View metric evidence" }));
        expect(screen.getByTestId("evidence-drawer")).toHaveTextContent(
            "/api/v1/explain?metric=review_latency",
        );
    });

    it("lists the further evidence links with the Explore URL production builds", () => {
        render(<OpportunityCard card={reduceReviewLatency} filters={filters} activeRole="eng" />);

        const more = within(screen.getByTestId("opportunity-card-evidence")).getByRole("link", {
            name: /Open artifact/i,
        });
        expect(more).toHaveAttribute("href", expect.stringContaining("api=%2Fapi%2Fv1%2Fexplain"));
    });

    it("links to the experiments with the filter and the role", () => {
        render(<OpportunityCard card={reduceReviewLatency} filters={filters} activeRole="eng" />);

        const link = screen.getByRole("link", { name: "Explore experiments" });
        const url = new URL(link.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/improve/experiments");
        expect(url.searchParams.get("f")).toBeTruthy();
        expect(url.searchParams.get("role")).toBe("eng");
    });

    it("disables the Evidence affordance when a card has no real artifacts", () => {
        const noArtifacts: OpportunityCardData = { ...reduceReviewLatency, evidence_links: [] };
        render(<OpportunityCard card={noArtifacts} filters={filters} activeRole="eng" />);

        const evidence = screen.getByTestId("opportunity-card-evidence");
        expect(within(evidence).queryByRole("button")).not.toBeInTheDocument();
        expect(within(evidence).getByText(/No linked artifacts in this window/i)).toHaveAttribute(
            "aria-disabled",
            "true",
        );
        expect(screen.getByTestId("opportunity-card-next-step")).toBeInTheDocument();
    });

    it("warns only when the title says reduce for a metric where higher is better", () => {
        const throughput: OpportunityCardData = {
            ...reduceReviewLatency,
            title: "Reduce Throughput",
            evidence_links: ["/api/v1/explain?metric=throughput"],
        };
        const { unmount } = render(
            <OpportunityCard card={throughput} filters={filters} activeRole="eng" />,
        );
        expect(screen.getByTestId("opportunity-direction-note")).toHaveTextContent(
            "For this metric a rise is usually good; read the evidence before acting.",
        );
        unmount();
        render(<OpportunityCard card={reduceReviewLatency} filters={filters} activeRole="eng" />);
        expect(screen.queryByTestId("opportunity-direction-note")).toBeNull();
    });

    it("reads the metric from an explain link only", () => {
        expect(metricFromEvidenceLink("/api/v1/explain?metric=cycle_time")).toBe("cycle_time");
        expect(metricFromEvidenceLink("/api/v1/home?metric=cycle_time")).toBeUndefined();
        expect(metricFromEvidenceLink(undefined)).toBeUndefined();
    });
});
