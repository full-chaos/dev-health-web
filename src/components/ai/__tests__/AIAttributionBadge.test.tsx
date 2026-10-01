import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import {
    AIAttributionBadge,
    attributionBucketForKind,
    normalizeAttributionBucket,
} from "../AIAttributionBadge";

describe("AIAttributionBadge", () => {
    it("renders the canonical bucket label", () => {
        render(<AIAttributionBadge bucket="ai_assisted" />);
        expect(screen.getByTestId("ai-attribution-badge")).toHaveTextContent("AI-assisted");
    });

    it("normalizes resolver-uppercase bucket values", () => {
        render(<AIAttributionBadge bucket="AGENT_CREATED" />);
        expect(screen.getByTestId("ai-attribution-badge")).toHaveTextContent("Agent-created");
    });

    it("falls back to unknown for unrecognized buckets (no upgrade)", () => {
        render(<AIAttributionBadge bucket="something-else" />);
        expect(screen.getByTestId("ai-attribution-badge")).toHaveTextContent("Unknown attribution");
    });

    it("shows the tool inline and confidence in the tooltip", () => {
        render(<AIAttributionBadge bucket="ai_assisted" tool="copilot" confidence={0.87} />);
        const badge = screen.getByTestId("ai-attribution-badge");
        expect(badge).toHaveTextContent("copilot");
        expect(badge).toHaveAttribute("title", "AI-assisted · Tool: copilot · Confidence: 87%");
    });
});

describe("normalizeAttributionBucket", () => {
    it.each([
        ["AI_ASSISTED", "ai_assisted"],
        ["AI_REVIEW", "ai_review"],
        ["human", "human"],
        ["", "unknown"],
        [null, "unknown"],
        ["weird", "unknown"],
    ])("maps %s to %s", (input, expected) => {
        expect(normalizeAttributionBucket(input)).toBe(expected);
    });
});

describe("attributionBucketForKind", () => {
    it.each([
        // The backend kind vocabulary maps through explicitly.
        ["ai_assisted", "ai_assisted"],
        ["AI_ASSISTED", "ai_assisted"],
        ["ai_review", "ai_review"],
        ["agent_created", "agent_created"],
        ["human", "human"],
        ["unknown", "unknown"],
        // Absent kinds stay unknown.
        [null, "unknown"],
        ["", "unknown"],
        ["   ", "unknown"],
    ])("maps kind %s to bucket %s", (input, expected) => {
        expect(attributionBucketForKind(input)).toBe(expected);
    });

    it.each([["copilot"], ["claude"], ["cursor"], ["unclassified"], ["manual"], ["agent"]])(
        "never upgrades unrecognized non-empty kind %s past unknown",
        (input) => {
            expect(attributionBucketForKind(input)).toBe("unknown");
        },
    );
});

describe("AIAttributionBadge pinned markup facts (CHAOS-7763, shared cards)", () => {
    it("has its test id and a tooltip with the label, the tool and the confidence", () => {
        render(<AIAttributionBadge bucket="AI_ASSISTED" tool="copilot" confidence={0.82} />);
        const badge = screen.getByTestId("ai-attribution-badge");
        expect(badge).toHaveAttribute("title", "AI-assisted · Tool: copilot · Confidence: 82%");
    });

    it("every bucket has its own label in the visible text", () => {
        for (const [bucket, label] of [
            ["ai_assisted", "AI-assisted"],
            ["ai_review", "AI-reviewed"],
            ["agent_created", "Agent-created"],
            ["human", "Human"],
            ["unknown", "Unknown attribution"],
        ] as const) {
            const { unmount } = render(<AIAttributionBadge bucket={bucket} />);
            expect(screen.getByTestId("ai-attribution-badge")).toHaveTextContent(label);
            unmount();
        }
    });
});
