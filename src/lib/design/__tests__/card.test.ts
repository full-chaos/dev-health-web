import { describe, it, expect } from "vitest";

import { CARD_SURFACE, cardClassName } from "../card";

describe("card primitive (framework C4)", () => {
    it("uses only V1 tokens for the card shell", () => {
        expect(CARD_SURFACE).toContain("rounded-(--radius-lg)");
        expect(CARD_SURFACE).toContain("border-(--border)");
        expect(CARD_SURFACE).toContain("bg-(--surface)");
        expect(CARD_SURFACE).toContain("shadow-(--elevation-card)");
        // Legacy bright stroke must not creep back in (CHAOS-2067).
        expect(CARD_SURFACE).not.toContain("card-stroke)");
    });

    it("composes call-site classes after the shell", () => {
        expect(cardClassName("p-4")).toBe(`${CARD_SURFACE} p-4`);
        expect(cardClassName()).toBe(CARD_SURFACE);
    });
});
