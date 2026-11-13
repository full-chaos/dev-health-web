import { describe, expect, it } from "vitest";
import { connectionChanged, keyAfterConnectionChange } from "../apiKeyReset";

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

describe("connectionChanged", () => {
    it("is true when the provider changes", () => {
        expect(
            connectionChanged(
                { provider: "openai", baseUrl: "" },
                { provider: "anthropic", baseUrl: "" },
            ),
        ).toBe(true);
    });

    it("is true when the base URL changes, is set or is cleared", () => {
        expect(
            connectionChanged(
                { provider: "openai", baseUrl: "" },
                { provider: "openai", baseUrl: "https://8.8.8.8/v1" },
            ),
        ).toBe(true);
        expect(
            connectionChanged(
                { provider: "openai", baseUrl: "https://8.8.8.8/v1" },
                { provider: "openai", baseUrl: "" },
            ),
        ).toBe(true);
    });

    it("is false when only base URL whitespace differs", () => {
        expect(
            connectionChanged(
                { provider: "openai", baseUrl: "https://api.example " },
                { provider: "openai", baseUrl: " https://api.example" },
            ),
        ).toBe(false);
    });
});
