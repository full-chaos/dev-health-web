import { describe, it, expect } from "vitest";

import { MetricCard } from "./MetricCard";
import { render, screen } from "@/test/utils";

describe("MetricCard delta slot (metric coherence: never a bare '--')", () => {
    it("renders the default 'No prior period' labeled state when delta is missing", () => {
        render(<MetricCard label="Success Rate" href="#" value={80} unit="%" />);
        expect(screen.getByText("No prior period")).toBeInTheDocument();
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
        expect(screen.getByText("Insufficient history")).toBeInTheDocument();
        expect(screen.queryByText("No prior period")).not.toBeInTheDocument();
    });

    it("exposes the no-comparison reason via a title tooltip", () => {
        render(<MetricCard label="Pass Rate" href="#" value={98} unit="%" />);
        const label = screen.getByText("No prior period");
        expect(label).toHaveAttribute("title", "No prior period available to compute a change");
    });

    it("renders a formatted delta when one is provided (no labeled fallback)", () => {
        render(<MetricCard label="Coverage" href="#" value={72} unit="%" delta={5} />);
        expect(screen.getByText("+5%")).toBeInTheDocument();
        expect(screen.queryByText("No prior period")).not.toBeInTheDocument();
    });

    it("renders a negative delta and still avoids the labeled fallback", () => {
        render(<MetricCard label="Queue Time" href="#" value={12} unit="m" delta={-3} />);
        expect(screen.getByText("-3%")).toBeInTheDocument();
        expect(screen.queryByText("No prior period")).not.toBeInTheDocument();
    });
});
