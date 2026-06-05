import { describe, it, expect } from "vitest";

import { CockpitEmptyState, type CockpitEmptyStateVariant } from "./CockpitEmptyState";
import { render, screen } from "@/test/utils";

const VARIANT_TITLES: Record<CockpitEmptyStateVariant, string> = {
    "no-data-connected": "No data connected",
    "detector-unavailable": "Connected but detector unavailable",
    "no-findings": "Enabled but no findings",
    "insufficient-confidence": "Insufficient confidence",
};

describe("CockpitEmptyState", () => {
    it.each(Object.entries(VARIANT_TITLES) as [CockpitEmptyStateVariant, string][])(
        "renders Phase-1 customer-safe copy for the %s variant",
        (variant, title) => {
            render(<CockpitEmptyState variant={variant} />);
            const root = screen.getByTestId(`cockpit-empty-${variant}`);
            expect(root).toHaveAttribute("data-variant", variant);
            expect(screen.getByText(title)).toBeInTheDocument();
        },
    );

    it("allows title and description overrides", () => {
        render(
            <CockpitEmptyState
                variant="no-findings"
                title="All quiet"
                description="Nothing surfaced for this team."
            />,
        );
        expect(screen.getByText("All quiet")).toBeInTheDocument();
        expect(screen.getByText("Nothing surfaced for this team.")).toBeInTheDocument();
        // Default copy should be replaced, not appended.
        expect(screen.queryByText("Enabled but no findings")).not.toBeInTheDocument();
    });

    it("renders an action node when provided", () => {
        render(
            <CockpitEmptyState
                variant="no-data-connected"
                action={<button type="button">Connect a source</button>}
            />,
        );
        expect(screen.getByText("Connect a source")).toBeInTheDocument();
    });

    it("honors a custom data-testid", () => {
        render(<CockpitEmptyState variant="insufficient-confidence" data-testid="signal-empty" />);
        expect(screen.getByTestId("signal-empty")).toBeInTheDocument();
    });
});
