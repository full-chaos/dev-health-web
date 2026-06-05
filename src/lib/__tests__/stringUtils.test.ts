import { describe, it, expect } from "vitest";
import { titleCase } from "../stringUtils";

describe("titleCase", () => {
    it("converts snake_case to Title Case", () => {
        expect(titleCase("my_key")).toBe("My Key");
    });

    it("converts kebab-case to Title Case", () => {
        expect(titleCase("my-key")).toBe("My Key");
    });

    it("converts space-separated to Title Case", () => {
        expect(titleCase("my key")).toBe("My Key");
    });

    it("handles single word", () => {
        expect(titleCase("hello")).toBe("Hello");
    });

    it("handles mixed underscores and hyphens", () => {
        expect(titleCase("feature_delivery-planning")).toBe("Feature Delivery Planning");
    });

    it("trims leading and trailing whitespace", () => {
        expect(titleCase("  hello world  ")).toBe("Hello World");
    });

    it("preserves already-capitalised words", () => {
        expect(titleCase("API key")).toBe("API Key");
    });
});
