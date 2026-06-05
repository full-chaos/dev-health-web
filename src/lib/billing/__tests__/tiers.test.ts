import { describe, it, expect } from "vitest";
import { TIER_LABELS, TIER_FEATURES } from "../tiers";

describe("TIER_LABELS", () => {
    it("provides display labels for all base tiers", () => {
        expect(TIER_LABELS["community"]).toBe("Community");
        expect(TIER_LABELS["team"]).toBe("Team");
        expect(TIER_LABELS["enterprise"]).toBe("Enterprise");
    });

    it("maps free alias to Community", () => {
        expect(TIER_LABELS["free"]).toBe("Community");
    });
});

describe("TIER_FEATURES", () => {
    it("provides upgrade description for team tier", () => {
        expect(TIER_FEATURES["team"]).toContain("insights");
    });

    it("provides upgrade description for enterprise tier", () => {
        expect(TIER_FEATURES["enterprise"]).toContain("enterprise");
    });
});
