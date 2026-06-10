import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { BetaBadge } from "./BetaBadge";

/**
 * BetaBadge reads NEXT_PUBLIC_BETA at module load time (const showBeta = ...),
 * so mid-test env mutations have no effect. Tests cover the default (visible) path.
 * The hidden path is exercised by integration tests that set the env before import.
 */
describe("BetaBadge", () => {
    it("renders a span with 'Beta' text", () => {
        render(<BetaBadge />);
        expect(screen.getByText("Beta")).toBeInTheDocument();
    });

    it("renders with the expected badge styles", () => {
        render(<BetaBadge />);
        const badge = screen.getByText("Beta");
        expect(badge.tagName).toBe("SPAN");
        expect(badge).toHaveClass("uppercase");
    });

    it("is accessible — no role attribute needed for a decorative badge", () => {
        render(<BetaBadge />);
        const badge = screen.getByText("Beta");
        expect(badge).toBeVisible();
    });
});
