import { describe, expect, it } from "vitest";
import { keyAfterConnectionChange } from "../apiKeyReset";

describe("keyAfterConnectionChange", () => {
    it("drops the key when the provider changes", () => {
        expect(
            keyAfterConnectionChange(
                { provider: "clef", baseUrl: "" },
                { provider: "typesafe", baseUrl: "" },
                "typed-key",
            ),
        ).toBe("");
    });

    it("drops the key when the base URL changes", () => {
        expect(
            keyAfterConnectionChange(
                { provider: "clef", baseUrl: "https://old.example" },
                { provider: "clef", baseUrl: "https://new.example" },
                "typed-key",
            ),
        ).toBe("");
    });

    it("keeps the key when only base URL whitespace changes", () => {
        expect(
            keyAfterConnectionChange(
                { provider: "clef", baseUrl: " https://api.example\t" },
                { provider: "clef", baseUrl: "https://api.example " },
                "typed-key",
            ),
        ).toBe("typed-key");
    });

    it("keeps the key unchanged when the connection does not change", () => {
        expect(
            keyAfterConnectionChange(
                { provider: "clef", baseUrl: "https://api.example" },
                { provider: "clef", baseUrl: "https://api.example" },
                " typed-key ",
            ),
        ).toBe(" typed-key ");
    });

    it("keeps an empty key empty", () => {
        expect(
            keyAfterConnectionChange(
                { provider: "clef", baseUrl: "" },
                { provider: "clef", baseUrl: "" },
                "",
            ),
        ).toBe("");
    });
});
