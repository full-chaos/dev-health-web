import { describe, expect, it } from "vitest";
import { getShadowTransport, shadowEnabled } from "../config";

describe("shadow switch", () => {
    it("is off when unset", () => {
        expect(shadowEnabled(undefined)).toBe(false);
    });
    it.each(["", "off", "ON", "On", "true", "1", " on", "on ", "yes"])("is off for %j", (v) => {
        expect(shadowEnabled(v)).toBe(false);
    });
    it("is on only for the exact value on", () => {
        expect(shadowEnabled("on")).toBe(true);
    });
});

describe("shadow transport seam", () => {
    it("has no transport until the transport leaf wires one", () => {
        expect(getShadowTransport()).toBeUndefined();
    });
});
