import { describe, it, expect } from "vitest";

import {
    DataConfidenceIndicator,
    SIGNAL_LEVEL_SENTENCE,
    type DataConfidence,
} from "./DataConfidenceIndicator";
import { render, screen } from "@/test/utils";

const base: DataConfidence = {
    level: "high",
    coverage_pct: 92,
    connected_sources: ["GitHub", "Jira"],
    missing_sources: [],
    caveats: [],
};

// The confidence banner of Home (CHAOS-8063): one Notice strip, approved prototype `note(...)`.
describe("DataConfidenceIndicator banner", () => {
    it.each([
        ["high", "High confidence", "good"],
        ["medium", "Medium confidence", "warn"],
        ["low", "Low confidence", "warn"],
    ] as const)(
        "%s: the served level in words, the %s notice tone and its icon",
        (level, label, variant) => {
            render(<DataConfidenceIndicator confidence={{ ...base, level }} />);
            const root = screen.getByTestId("data-confidence-indicator");
            expect(root).toHaveAttribute("data-level", level);
            expect(root).toHaveAttribute("data-notice-variant", variant);
            expect(screen.getByTestId("data-confidence-level")).toHaveTextContent(label);
            // Status colour is never the only signal: the notice has its icon.
            expect(root.querySelector("svg[aria-hidden='true']")).not.toBeNull();
        },
    );

    it("is ONE strip: no heading, no second card, no coverage chip, no caveat list", () => {
        const { container } = render(
            <DataConfidenceIndicator
                confidence={{ ...base, caveats: ["Weekend data is sparse."] }}
            />,
        );
        expect(container.children).toHaveLength(1);
        expect(screen.queryByRole("heading")).toBeNull();
        expect(screen.queryByTestId("data-confidence-coverage")).toBeNull();
        expect(screen.queryByTestId("data-confidence-caveats")).toBeNull();
        expect(container).not.toHaveTextContent("Weekend data is sparse.");
        expect(container).not.toHaveTextContent("92");
    });

    it("names the served connected sources and ends with the signal-level sentence", () => {
        render(<DataConfidenceIndicator confidence={base} />);
        expect(screen.getByTestId("data-confidence-text")).toHaveTextContent(
            `Connected sources: GitHub, Jira. ${SIGNAL_LEVEL_SENTENCE}`,
        );
    });

    it("names the served missing sources: missing is not healthy", () => {
        render(
            <DataConfidenceIndicator
                confidence={{
                    ...base,
                    level: "medium",
                    connected_sources: ["GitHub"],
                    missing_sources: ["GitLab", "Jira"],
                }}
            />,
        );
        expect(screen.getByTestId("data-confidence-text")).toHaveTextContent(
            `Connected sources: GitHub. Missing sources: GitLab, Jira. ${SIGNAL_LEVEL_SENTENCE}`,
        );
    });

    it("writes no source sentence when the API served no source name", () => {
        render(
            <DataConfidenceIndicator
                confidence={{ ...base, connected_sources: [], missing_sources: [] }}
            />,
        );
        expect(screen.getByTestId("data-confidence-text").textContent).toBe(SIGNAL_LEVEL_SENTENCE);
    });

    it("is not a live region (the page is static content)", () => {
        render(<DataConfidenceIndicator confidence={base} />);
        expect(screen.queryByRole("status")).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
    });
});
