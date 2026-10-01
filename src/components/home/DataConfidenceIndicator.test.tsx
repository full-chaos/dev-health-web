import { describe, it, expect } from "vitest";

import { DataConfidenceIndicator, type DataConfidence } from "./DataConfidenceIndicator";
import { render, screen } from "@/test/utils";

const base: DataConfidence = {
    level: "high",
    coverage_pct: 92,
    connected_sources: ["GitHub", "Jira"],
    missing_sources: [],
    caveats: [],
};

describe("DataConfidenceIndicator", () => {
    it("renders the high-confidence level and coverage", () => {
        render(<DataConfidenceIndicator confidence={base} />);
        const root = screen.getByTestId("data-confidence-indicator");
        expect(root).toHaveAttribute("data-level", "high");
        expect(screen.getByText("High confidence")).toBeInTheDocument();
        expect(screen.getByTestId("data-confidence-coverage")).toHaveTextContent("92% coverage");
    });

    it("renders the medium-confidence level", () => {
        render(<DataConfidenceIndicator confidence={{ ...base, level: "medium" }} />);
        expect(screen.getByTestId("data-confidence-indicator")).toHaveAttribute(
            "data-level",
            "medium",
        );
        expect(screen.getByText("Medium confidence")).toBeInTheDocument();
    });

    it("renders the low-confidence level", () => {
        render(<DataConfidenceIndicator confidence={{ ...base, level: "low" }} />);
        expect(screen.getByTestId("data-confidence-indicator")).toHaveAttribute(
            "data-level",
            "low",
        );
        expect(screen.getByText("Low confidence")).toBeInTheDocument();
    });

    it("lists connected and missing sources", () => {
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
        expect(screen.getByText("Connected")).toBeInTheDocument();
        expect(screen.getByText("GitHub")).toBeInTheDocument();
        expect(screen.getByText("Missing")).toBeInTheDocument();
        expect(screen.getByText("GitLab")).toBeInTheDocument();
        expect(screen.getByText("Jira")).toBeInTheDocument();
    });

    it("renders caveats when present and omits the list when empty", () => {
        const { rerender } = render(
            <DataConfidenceIndicator
                confidence={{
                    ...base,
                    caveats: ["Weekend data is sparse for this window."],
                }}
            />,
        );
        expect(screen.getByTestId("data-confidence-caveats")).toHaveTextContent(
            "Weekend data is sparse for this window.",
        );

        rerender(<DataConfidenceIndicator confidence={{ ...base, caveats: [] }} />);
        expect(screen.queryByTestId("data-confidence-caveats")).not.toBeInTheDocument();
    });

    it("omits coverage when coverage_pct is missing", () => {
        render(<DataConfidenceIndicator confidence={{ ...base, coverage_pct: null }} />);
        expect(screen.queryByTestId("data-confidence-coverage")).not.toBeInTheDocument();
    });

    it("clamps out-of-range coverage to 0–100", () => {
        render(<DataConfidenceIndicator confidence={{ ...base, coverage_pct: 140 }} />);
        expect(screen.getByTestId("data-confidence-coverage")).toHaveTextContent("100% coverage");
    });
});

describe("DataConfidenceIndicator text pin (CHAOS-7611 5.1a)", () => {
    it("shows the same text and test ids for each level (recorded before the Notice change)", () => {
        const out = (["high", "medium", "low"] as const).map((level) => {
            const { container, unmount } = render(
                <DataConfidenceIndicator
                    confidence={{
                        ...base,
                        level,
                        missing_sources: ["GitLab"],
                        caveats: ["Weekend data is sparse."],
                    }}
                />,
            );
            const root = screen.getByTestId("data-confidence-indicator");
            const text = (container.textContent ?? "").replace(/\s+/g, " ").trim();
            const ids = [...container.querySelectorAll("[data-testid]")].map((e) =>
                e.getAttribute("data-testid"),
            );
            const record = {
                level: root.getAttribute("data-level"),
                label: root.getAttribute("aria-label"),
                text,
                ids,
            };
            unmount();
            return record;
        });
        expect(out).toMatchSnapshot();
    });
});

describe("DataConfidenceIndicator as a Notice (CHAOS-7611 5.1a)", () => {
    it.each([
        ["high", "good"],
        ["medium", "warn"],
        ["low", "warn"],
    ] as const)(
        "%s confidence is a %s notice with its word and icon, not color alone",
        (level, variant) => {
            const { container } = render(
                <DataConfidenceIndicator confidence={{ ...base, level }} />,
            );
            const notice = container.querySelector("[data-notice-variant]") as HTMLElement;
            expect(notice).toHaveAttribute("data-notice-variant", variant);
            expect(notice.querySelector("svg[aria-hidden='true']")).not.toBeNull();
            expect(
                screen.getByText(`${level[0].toUpperCase()}${level.slice(1)} confidence`),
            ).toBeInTheDocument();
        },
    );

    it("is not a live region (the page is static content)", () => {
        render(<DataConfidenceIndicator confidence={base} />);
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("shows the Evidence & context card only when there is something to show", () => {
        const { rerender } = render(<DataConfidenceIndicator confidence={base} />);
        expect(screen.getByRole("heading", { name: "Evidence & context" })).toBeInTheDocument();
        rerender(
            <DataConfidenceIndicator
                confidence={{ ...base, connected_sources: [], missing_sources: [], caveats: [] }}
            />,
        );
        expect(screen.queryByRole("heading", { name: "Evidence & context" })).toBeNull();
    });
});
