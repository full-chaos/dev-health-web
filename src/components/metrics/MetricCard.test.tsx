import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

import { MetricCard } from "./MetricCard";
import { render, screen } from "@/test/utils";

describe("MetricCard delta slot (metric coherence: never a bare '--')", () => {
    it("renders the default 'No prior period' labeled state when delta is missing", () => {
        render(<MetricCard label="Success Rate" href="#" value={80} unit="%" />);
        expect(screen.getByText(/No prior period/)).toBeInTheDocument();
        // The delta slot must never show a bare '--' (value is present, so no '--' anywhere).
        expect(screen.queryByText("--")).not.toBeInTheDocument();
    });

    it("honors a custom deltaUnavailableLabel ('Insufficient history')", () => {
        render(
            <MetricCard
                label="Failure Rate"
                href="#"
                value={9}
                unit="%"
                deltaUnavailableLabel="Insufficient history"
            />,
        );
        expect(screen.getByText(/Insufficient history/)).toBeInTheDocument();
        expect(screen.queryByText("No prior period")).not.toBeInTheDocument();
    });

    it("exposes the no-comparison reason via a title tooltip", () => {
        render(<MetricCard label="Pass Rate" href="#" value={98} unit="%" />);
        const label = screen.getByText(/No prior period/);
        expect(label).toHaveAttribute("title", "No prior period available to compute a change");
    });

    it("renders a formatted delta when one is provided (no labeled fallback)", () => {
        render(<MetricCard label="Coverage" href="#" value={72} unit="%" delta={5} />);
        expect(screen.getByText(/\+5%/)).toBeInTheDocument();
        expect(screen.queryByText("No prior period")).not.toBeInTheDocument();
    });

    it("renders a negative delta and still avoids the labeled fallback", () => {
        render(<MetricCard label="Queue Time" href="#" value={12} unit="m" delta={-3} />);
        expect(screen.getByText(/-3%/)).toBeInTheDocument();
        expect(screen.queryByText("No prior period")).not.toBeInTheDocument();
    });
});

describe("MetricCard link affordance (no placeholder href='#')", () => {
    it("renders as a non-link with no 'Open evidence' cue when href is omitted", () => {
        render(<MetricCard label="Line Coverage" value={85} unit="%" />);
        // No anchor → the card no longer looks clickable when it goes nowhere.
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(screen.queryByText("Open evidence")).not.toBeInTheDocument();
    });

    it("renders a real link with the 'Open evidence' cue when href is provided", () => {
        render(<MetricCard label="Line Coverage" href="/explore" value={85} unit="%" />);
        expect(screen.getByRole("link")).toHaveAttribute("href", "/explore");
        expect(screen.getByText("Open evidence")).toBeInTheDocument();
    });
});

describe("MetricCard inverse-good delta coloring (lower-is-better metrics)", () => {
    it("colors a positive delta as caution without inverting the displayed number", () => {
        render(<MetricCard label="Failure Rate" value={36} unit="%" delta={5} inverseGood />);
        // Truthful number: an increase reads as +5%, never a negated -5%.
        const deltaEl = screen.getByText(/\+5%/);
        expect(screen.queryByText(/-5%/)).not.toBeInTheDocument();
        // ...but the tone is a regression (caution/negative), not positive/green.
        expect(deltaEl.className).toContain("--accent-negative");
        expect(deltaEl.className).not.toContain("--positive");
    });
});

describe("MetricCard sparkline with null (missing) points", () => {
    it("shows 'No trend yet' when fewer than two points are real values", () => {
        render(
            <MetricCard
                label="Coverage"
                value={undefined}
                spark={[
                    { ts: "2026-06-01", value: 50 },
                    { ts: "2026-06-02", value: null },
                    { ts: "2026-06-03", value: null },
                ]}
            />,
        );
        expect(screen.getByText("No trend yet")).toBeInTheDocument();
    });
    it("counts a produced 0 as a real point", () => {
        render(
            <MetricCard
                label="Coverage"
                value={0}
                spark={[
                    { ts: "2026-06-01", value: 0 },
                    { ts: "2026-06-02", value: 0 },
                ]}
            />,
        );
        expect(screen.queryByText("No trend yet")).not.toBeInTheDocument();
    });
});
