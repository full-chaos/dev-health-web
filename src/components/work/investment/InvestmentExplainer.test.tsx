import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InvestmentExplainer } from "./InvestmentExplainer";

const explanation = (overrides: Record<string, unknown> = {}) =>
    ({
        data: {
            summary: "Effort appears to lean toward feature delivery.",
            top_findings: [
                {
                    finding: "Feature delivery appears to take the largest share.",
                    evidence: {
                        theme: "feature_delivery",
                        subcategory: "feature_delivery.new_feature",
                        share_pct: 63.963245258098866,
                        evidence_quality_band: "moderate",
                    },
                },
                {
                    finding: "Maintenance appears smaller.",
                    evidence: { theme: "maintenance", share_pct: 12, evidence_quality_band: null },
                },
            ],
            confidence: {
                level: "moderate",
                quality_mean: 0.48,
                quality_stddev: 0.14,
                drivers: ["low_text_signal"],
            },
            what_to_check_next: [
                {
                    action: "Inspect the largest theme",
                    why: "It carries most of the effort.",
                    where: "theme_distribution_top and subcategory_distribution_top",
                },
            ],
            anti_claims: ["It does not rate people."],
            status: "valid",
            ...overrides,
        },
        filtersKey: "k",
        focus: { theme: null, subcategory: null },
    }) as never;

const renderExplainer = (mixExplanation = explanation()) =>
    render(
        <InvestmentExplainer
            mixExplanation={mixExplanation}
            mixExplainKey="k"
            isExplainingMix={false}
            onRegenerate={() => {}}
        />,
    );

describe("InvestmentExplainer in the narrow card", () => {
    it("lists findings in one column that cannot overflow", () => {
        renderExplainer();
        const list = screen.getByTestId("explainer-findings");
        expect(list.tagName).toBe("UL");
        expect(list.className).not.toMatch(/grid-cols|\bgrid\b/);
        const items = list.querySelectorAll("li");
        expect(items).toHaveLength(2);
        for (const item of items) expect(item.className).toContain("min-w-0");
    });

    it("shows the theme label and the rounded share", () => {
        renderExplainer();
        expect(screen.getByText("Feature Delivery")).toBeInTheDocument();
        expect(screen.queryByText("feature_delivery")).not.toBeInTheDocument();
        expect(screen.getByText("64%")).toBeInTheDocument();
        expect(screen.queryByText(/63\.96/)).not.toBeInTheDocument();
    });

    it("names the subcategory on the chip with the theme as muted text", () => {
        const { container } = renderExplainer();
        const first = container.querySelectorAll("li")[0] as HTMLElement;
        expect(first).toHaveTextContent("New Feature");
        expect(first).toHaveTextContent("Feature Delivery");
        expect(first).toHaveTextContent("64%");
        expect(first.textContent).not.toMatch(/feature_delivery|new_feature/);
    });

    it("shows the theme label and whole-percent share when there is no subcategory", () => {
        const { container } = renderExplainer();
        const second = container.querySelectorAll("li")[1] as HTMLElement;
        expect(second).toHaveTextContent("Maintenance");
        expect(second).toHaveTextContent("12%");
    });

    it("rounds a fractional share once", () => {
        renderExplainer(
            explanation({
                top_findings: [
                    {
                        finding: "Quality work appears sizeable.",
                        evidence: {
                            theme: "quality",
                            subcategory: "quality.bugfix",
                            share_pct: 22.4,
                        },
                    },
                ],
            }),
        );
        expect(screen.getByText("22%")).toBeInTheDocument();
        expect(screen.getByText("Bugfix")).toBeInTheDocument();
        expect(screen.queryByText(/22\.4/)).not.toBeInTheDocument();
        expect(screen.queryByText(/quality\.bugfix/)).not.toBeInTheDocument();
    });

    it("does not repeat the confidence block", () => {
        const { container } = renderExplainer();
        expect(screen.queryByText("Confidence")).not.toBeInTheDocument();
        expect(screen.queryByText("moderate", { selector: "span.uppercase" })).toBeNull();
        expect(container.textContent).not.toMatch(/\+-/);
        expect(container.textContent).not.toMatch(/Mean:/);
    });

    it("keeps the confidence drivers", () => {
        renderExplainer();
        expect(screen.getByText("low text signal")).toBeInTheDocument();
    });

    it("does not render the internal where field", () => {
        const { container } = renderExplainer();
        expect(container.textContent).not.toContain("theme_distribution_top");
        expect(screen.getByText("Inspect the largest theme")).toBeInTheDocument();
        expect(screen.getByText(/It carries most of the effort/)).toBeInTheDocument();
    });

    it("keeps the label, anti-claims and regenerate control", () => {
        renderExplainer();
        expect(screen.getByTestId("ai-generated-label")).toHaveTextContent("AI-generated");
        expect(screen.getByText("What this does NOT say")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
    });
});

describe("InvestmentExplainer issue size coverage (CHAOS-9809)", () => {
    const withEvidence = (evidence: Record<string, unknown>) =>
        explanation({
            top_findings: [
                {
                    finding: "Feature delivery appears to take the largest share.",
                    evidence: { theme: "feature_delivery", share_pct: 60, ...evidence },
                },
            ],
        });

    it("reads a low sizing coverage as mostly count", () => {
        renderExplainer(
            withEvidence({
                measure: "ISSUE_SIZE",
                sizing_coverage: 0.1,
                unsized_unit_count: 9,
            }),
        );
        expect(screen.getByTestId("finding-sizing")).toHaveTextContent(/mostly count/i);
    });

    it("reads a missing sizing coverage on an ISSUE_SIZE share as not measured", () => {
        renderExplainer(withEvidence({ measure: "ISSUE_SIZE" }));
        const note = screen.getByTestId("finding-sizing");
        expect(note).toHaveTextContent(/not served/i);
        expect(note).not.toHaveTextContent(/carry an issue size\./);
    });

    it("prints no sizing note for a COUNT share", () => {
        renderExplainer(withEvidence({ measure: "COUNT" }));
        expect(screen.queryByTestId("finding-sizing")).toBeNull();
    });
});
