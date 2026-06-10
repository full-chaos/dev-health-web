import { render, screen, within } from "@/test/utils";
import { describe, expect, it } from "vitest";

import { OpportunityCard } from "./OpportunityCard";
import type { MetricFilter } from "@/lib/filters/types";
import type { OpportunityCard as OpportunityCardData } from "@/lib/types";

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
    evidence_links: ["/api/v1/explain?metric=review_latency"],
    suggested_experiments: [
        "Trial a 24h review SLA for the auth squad",
        "Add a second reviewer to the on-call rota",
    ],
};

describe("OpportunityCard — Evidence panel contract", () => {
    it("renders recommendations only in the Recommended next step slot, never as Evidence", () => {
        render(<OpportunityCard card={reduceReviewLatency} filters={filters} activeRole="eng" />);

        const evidence = screen.getByTestId("opportunity-card-evidence");
        expect(within(evidence).getByText("Evidence")).toBeInTheDocument();
        const artifactLink = within(evidence).getByRole("link", {
            name: /Open artifact/i,
        });
        expect(artifactLink).toHaveAttribute(
            "href",
            expect.stringContaining("api=%2Fapi%2Fv1%2Fexplain"),
        );

        const nextStep = screen.getByTestId("opportunity-card-next-step");
        expect(within(nextStep).getByText("Recommended next step")).toBeInTheDocument();
        expect(within(nextStep).getByText(/24h review SLA/)).toBeInTheDocument();
        expect(within(nextStep).getByText(/second reviewer/)).toBeInTheDocument();

        expect(within(evidence).queryByText(/24h review SLA/)).not.toBeInTheDocument();
        expect(within(evidence).queryByText(/second reviewer/)).not.toBeInTheDocument();
    });

    it("disables the Evidence affordance when a card has no real artifacts", () => {
        const noArtifacts: OpportunityCardData = {
            ...reduceReviewLatency,
            evidence_links: [],
        };

        render(<OpportunityCard card={noArtifacts} filters={filters} activeRole="eng" />);

        const evidence = screen.getByTestId("opportunity-card-evidence");
        expect(within(evidence).queryByRole("link")).not.toBeInTheDocument();
        const placeholder = within(evidence).getByText(/No linked artifacts in this window/i);
        expect(placeholder).toHaveAttribute("aria-disabled", "true");

        // Recommendations still render in their dedicated slot.
        expect(screen.getByTestId("opportunity-card-next-step")).toBeInTheDocument();
    });
});
