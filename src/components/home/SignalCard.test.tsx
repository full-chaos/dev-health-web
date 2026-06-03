import { render, screen, userEvent } from "@/test/utils";
import { describe, expect, it, vi } from "vitest";

import { SignalCard, type CockpitSignal } from "./SignalCard";

const baseSignal: CockpitSignal = {
  id: "sig-1",
  title: "Review latency is climbing",
  metric: "review_latency",
  severity: "high",
  confidence: "medium",
  affected_scope: "3 repos · payments",
  evidence_count: 7,
  current: 2.4,
  prior: 1.6,
  delta_pct: 50,
  unit: "days",
  direction: "up",
  why_it_matters: "Longer reviews delay delivery and frustrate contributors.",
  recommended_action: "Rebalance reviewers on the payments repos.",
  evidence_ref: "/api/home/explain/review_latency",
};

describe("SignalCard", () => {
  it("renders all four required encodings plus why + recommended action", () => {
    render(<SignalCard signal={baseSignal} onOpenEvidence={() => undefined} />);

    // 1) severity, 2) confidence, 3) affected scope, 4) evidence count
    expect(screen.getByTestId("signal-severity")).toHaveTextContent(/high/i);
    expect(screen.getByTestId("signal-confidence")).toHaveTextContent(/medium confidence/i);
    expect(screen.getByTestId("signal-scope")).toHaveTextContent("3 repos · payments");
    expect(screen.getByTestId("signal-evidence-count")).toHaveTextContent(/7 artifacts/i);

    // why + recommended action
    expect(screen.getByTestId("signal-why")).toHaveTextContent(/longer reviews delay/i);
    expect(screen.getByTestId("signal-recommended-action")).toHaveTextContent(
      /rebalance reviewers/i,
    );
  });

  it("shows current/prior/delta with direction", () => {
    render(<SignalCard signal={baseSignal} onOpenEvidence={() => undefined} />);

    expect(screen.getByTestId("signal-card")).toHaveAttribute("data-direction", "up");
    expect(screen.getByTestId("signal-current")).toHaveTextContent("2.4d");
    expect(screen.getByTestId("signal-delta")).toHaveTextContent(/\+50%/);
    expect(screen.getByText(/from 1\.6d prior/i)).toBeInTheDocument();
  });

  it("renders a no-prior-period state when prior is null", () => {
    render(<SignalCard signal={{ ...baseSignal, prior: null }} onOpenEvidence={() => undefined} />);
    expect(screen.getByText(/no prior period/i)).toBeInTheDocument();
  });

  it.each(["critical", "high", "medium", "low"] as const)(
    "encodes %s severity on the card",
    (severity) => {
      render(<SignalCard signal={{ ...baseSignal, severity }} onOpenEvidence={() => undefined} />);
      expect(screen.getByTestId("signal-card")).toHaveAttribute("data-severity", severity);
      expect(screen.getByTestId("signal-severity")).toHaveTextContent(new RegExp(severity, "i"));
    },
  );

  it.each(["high", "medium", "low"] as const)("encodes %s confidence on the card", (confidence) => {
    render(<SignalCard signal={{ ...baseSignal, confidence }} onOpenEvidence={() => undefined} />);
    expect(screen.getByTestId("signal-card")).toHaveAttribute("data-confidence", confidence);
    expect(screen.getByTestId("signal-confidence")).toHaveTextContent(
      new RegExp(`${confidence} confidence`, "i"),
    );
  });

  it("opens evidence via the signal's evidence_ref apiUrl", async () => {
    const onOpenEvidence = vi.fn();
    render(<SignalCard signal={baseSignal} onOpenEvidence={onOpenEvidence} />);

    await userEvent.click(screen.getByTestId("signal-open-evidence"));

    expect(onOpenEvidence).toHaveBeenCalledWith(baseSignal.title, {
      apiUrl: baseSignal.evidence_ref,
    });
  });

  it("applies the emphasized treatment for the top signal", () => {
    render(<SignalCard signal={baseSignal} emphasized onOpenEvidence={() => undefined} />);
    expect(screen.getByTestId("signal-card")).toHaveAttribute("data-emphasized", "true");
    expect(screen.getByText(/top signal/i)).toBeInTheDocument();
  });
});
