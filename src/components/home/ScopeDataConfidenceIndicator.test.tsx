import { describe, expect, it } from "vitest";

import { ScopeDataConfidenceIndicator } from "./ScopeDataConfidenceIndicator";
import { render, screen } from "@/test/utils";

describe("ScopeDataConfidenceIndicator", () => {
    it("renders the served scope assessment independently of organization confidence", () => {
        render(
            <ScopeDataConfidenceIndicator
                confidence={{
                    level: "medium",
                    coverage_pct: 50,
                    last_ingested_at: "2026-10-04T18:00:00Z",
                    caveats: ["Repository metrics are partial for this window."],
                }}
            />,
        );

        const indicator = screen.getByTestId("scope-data-confidence-indicator");
        expect(indicator).toHaveAttribute("data-level", "medium");
        expect(indicator).toHaveAttribute("data-notice-variant", "warn");
        expect(screen.getByTestId("scope-data-confidence-level")).toHaveTextContent(
            "Scope data confidence: medium",
        );
        expect(screen.getByTestId("scope-data-confidence-text")).toHaveTextContent(
            "Scope coverage: 50%.",
        );
        expect(indicator).toHaveTextContent("Repository metrics are partial for this window.");
        expect(indicator).not.toHaveTextContent("Connected sources:");
    });

    it.each([
        [null, "Not reported"],
        [0, "0%"],
    ] as const)("keeps scope coverage %s as %s", (coverage_pct, expected) => {
        render(
            <ScopeDataConfidenceIndicator
                confidence={{
                    level: "low",
                    coverage_pct,
                    last_ingested_at: null,
                    caveats: ["No repository metrics exist for this scope."],
                }}
            />,
        );

        expect(screen.getByTestId("scope-data-confidence-text")).toHaveTextContent(
            `Scope coverage: ${expected}. Last scoped ingest: Not reported`,
        );
    });
});
