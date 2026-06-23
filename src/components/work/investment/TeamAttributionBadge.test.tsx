/**
 * TeamAttributionBadge unit tests (CHAOS-2608 / CS7).
 *
 * The badge is render-only: it surfaces backend `source`/`confidence`
 * provenance and renders `manual_fallback` as a distinct lower-confidence label.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { TeamAttributionBadge } from "./TeamAttributionBadge";

describe("TeamAttributionBadge", () => {
    it("renders the source label for a first-class attribution", () => {
        render(<TeamAttributionBadge source="NATIVE_TEAM" confidence="HIGH" teamName="Platform" />);
        const badge = screen.getByTestId("team-attribution-badge");
        expect(badge).toHaveTextContent(/native team/i);
        expect(badge).toHaveAttribute("data-manual-fallback", "false");
        expect(badge.getAttribute("title")).toMatch(/Platform/);
    });

    it("renders manual_fallback as a distinct 'Manual · low confidence' label", () => {
        render(<TeamAttributionBadge source="MANUAL_FALLBACK" confidence="MANUAL" />);
        const badge = screen.getByTestId("team-attribution-badge");
        expect(badge).toHaveTextContent(/manual · low confidence/i);
        expect(badge).toHaveAttribute("data-manual-fallback", "true");
        expect(badge).toHaveAttribute("data-source", "MANUAL_FALLBACK");
    });
});
