import { render, screen, within } from "@/test/utils";
import { describe, expect, it } from "vitest";

import { FocusCard } from "./FocusCard";
import type { MetricFilter } from "@/lib/filters/types";
import type { OpportunityCard } from "@/lib/types";

const filters = {
  scope: { level: "org", ids: ["org-1"] },
  time: { range_days: 30 },
  who: {},
  what: {},
  why: {},
  how: {},
} as MetricFilter;

// Worked example from the Evidence panel contract (CHAOS-2036).
const reduceReviewLatency: OpportunityCard = {
  id: "reduce-review-latency",
  title: "Reduce Review Latency",
  rationale: "Review wait time appears to lengthen cycle time in this window.",
  evidence_links: ["/api/v1/explain?metric=review_latency"],
  suggested_experiments: [
    "Trial a 24h review SLA for the auth squad",
    "Add a second reviewer to the on-call rota",
  ],
};

describe("FocusCard — Evidence panel contract", () => {
  it("renders recommendations only in the Recommended next step slot, never as Evidence", () => {
    render(<FocusCard card={reduceReviewLatency} filters={filters} activeRole="eng" />);

    // The Evidence section links to the real artifact and nothing else.
    const evidence = screen.getByTestId("focus-card-evidence");
    expect(within(evidence).getByText("Evidence")).toBeInTheDocument();
    const artifactLink = within(evidence).getByRole("link", {
      name: /Open artifact/i,
    });
    expect(artifactLink).toHaveAttribute(
      "href",
      expect.stringContaining("api=%2Fapi%2Fv1%2Fexplain"),
    );

    // Recommendations live in their own slot, clearly separated from Evidence.
    const nextStep = screen.getByTestId("focus-card-next-step");
    expect(within(nextStep).getByText("Recommended next step")).toBeInTheDocument();
    expect(within(nextStep).getByText(/24h review SLA/)).toBeInTheDocument();
    expect(within(nextStep).getByText(/second reviewer/)).toBeInTheDocument();

    // The experiments must NOT appear inside the Evidence section.
    expect(within(evidence).queryByText(/24h review SLA/)).not.toBeInTheDocument();
    expect(within(evidence).queryByText(/second reviewer/)).not.toBeInTheDocument();
  });

  it("disables the Evidence affordance when a card has no real artifacts", () => {
    const noArtifacts: OpportunityCard = {
      ...reduceReviewLatency,
      evidence_links: [],
    };

    render(<FocusCard card={noArtifacts} filters={filters} activeRole="eng" />);

    const evidence = screen.getByTestId("focus-card-evidence");
    // No artifact links are rendered…
    expect(within(evidence).queryByRole("link")).not.toBeInTheDocument();
    // …instead the affordance is disabled/renamed rather than back-filled.
    const placeholder = within(evidence).getByText(/No linked artifacts in this window/i);
    expect(placeholder).toHaveAttribute("aria-disabled", "true");

    // Recommendations still render in their dedicated slot.
    expect(screen.getByTestId("focus-card-next-step")).toBeInTheDocument();
  });
});
