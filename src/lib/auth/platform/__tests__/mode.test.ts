import { describe, expect, it } from "vitest";
import { PLATFORM_UI_ENFORCE_VALUE, PLATFORM_UI_SWITCH, platformUiMode } from "../mode";

describe("C3 platform UI mode parser", () => {
    it.each([
        undefined,
        "",
        "off",
        "SHADOW",
        " shadow",
        "shadow ",
        "Enforce",
        "ENFORCE",
        " enforce",
        "enforce ",
        "enforced",
        "on",
        "true",
        "1",
    ])("reads %j as off", (value) => {
        expect(platformUiMode(value)).toBe("off");
    });
    it("reads exactly shadow as shadow", () => {
        expect(platformUiMode("shadow")).toBe("shadow");
    });
    it("reads exactly enforce as enforce", () => {
        expect(platformUiMode("enforce")).toBe("enforce");
    });
    it("names the one env switch", () => {
        expect(PLATFORM_UI_SWITCH).toEqual({ name: "AUTHZ_PLATFORM_UI", onValue: "shadow" });
        expect(PLATFORM_UI_ENFORCE_VALUE).toBe("enforce");
    });
});
