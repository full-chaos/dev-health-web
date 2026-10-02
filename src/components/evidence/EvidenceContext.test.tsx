import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { STATUS_PILL } from "@/lib/statusPill";

vi.mock("@/lib/lensContext.client", () => ({ useActiveRole: () => "ic" }));

import { EvidenceContext } from "./EvidenceContext";

// CHAOS-7883: the trend chip uses the status tokens, not raw green/red palette classes.
describe("EvidenceContext trend chip", () => {
    it("up uses the positive status token and keeps the arrow", () => {
        render(<EvidenceContext data={{ trend: "up", magnitude: "+5%" }} />);
        const chip = screen.getByText(/\+5%/).closest("div");
        expect(chip?.className).toContain(STATUS_PILL.positive);
        expect(chip).toHaveTextContent("↗");
    });

    it("down uses the negative status token and keeps the arrow", () => {
        render(<EvidenceContext data={{ trend: "down", magnitude: "-5%" }} />);
        const chip = screen.getByText(/-5%/).closest("div");
        expect(chip?.className).toContain(STATUS_PILL.negative);
        expect(chip).toHaveTextContent("↘");
    });

    it("flat stays neutral", () => {
        render(<EvidenceContext data={{ trend: "flat", magnitude: "0%" }} />);
        const chip = screen.getByText(/0%/).closest("div");
        expect(chip?.className).toContain("text-(--ink-muted)");
        expect(chip).toHaveTextContent("→");
    });
});
