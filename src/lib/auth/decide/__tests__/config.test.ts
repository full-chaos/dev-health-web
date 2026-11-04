import { describe, expect, it } from "vitest";
import { DECIDE_TIMEOUT_MS, decideEnforced, getDecideTransport } from "../config";

describe("C3 the enforce switch", () => {
    it("is off when unset", () => {
        expect(decideEnforced(undefined)).toBe(false);
    });
    it.each(["", "off", "ON", "On", "true", "1", " on", "on ", "yes"])("is off for %j", (v) => {
        expect(decideEnforced(v)).toBe(false);
    });
    it("is on only for the exact value on", () => {
        expect(decideEnforced("on")).toBe(true);
    });
});

describe("decide settings", () => {
    it("has a 1500 ms bound", () => {
        expect(DECIDE_TIMEOUT_MS).toBe(1500);
    });
    it("has no transport until the transport leaf lands", () => {
        expect(getDecideTransport()).toBeUndefined();
    });
});
