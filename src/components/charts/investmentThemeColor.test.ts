import { describe, expect, it } from "vitest";
import { fallbackTokens, investmentThemeColor } from "./chartTheme";

describe("investmentThemeColor", () => {
    const tokens = {
        ...fallbackTokens,
        themeFeature: "feature",
        themeQuality: "quality",
        themeRisk: "risk",
        themeMaintenance: "maintenance",
        themeOperational: "operational",
    };

    it("fixes each theme to its own token regardless of rank", () => {
        expect(investmentThemeColor("feature_delivery", tokens, "x")).toBe("feature");
        expect(investmentThemeColor("quality", tokens, "x")).toBe("quality");
        expect(investmentThemeColor("risk", tokens, "x")).toBe("risk");
        expect(investmentThemeColor("maintenance", tokens, "x")).toBe("maintenance");
        expect(investmentThemeColor("operational", tokens, "x")).toBe("operational");
    });

    it("falls back to the given color for an unknown theme", () => {
        expect(investmentThemeColor("other", tokens, "rank-color")).toBe("rank-color");
    });
});
