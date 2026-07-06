import { describe, expect, it } from "vitest";
import { currentIpCoveredByRule, parseIpOrCidr, validateIpOrCidrInput } from "./cidr";

describe("validateIpOrCidrInput", () => {
    it.each([
        ["192.168.1.0/24", null],
        ["10.0.0.1", null],
        ["0.0.0.0/0", null],
        ["255.255.255.255/32", null],
        ["2001:db8::/32", null],
        ["::1", null],
        ["fe80::1/64", null],
    ])("accepts %s", (value, expected) => {
        expect(validateIpOrCidrInput(value)).toBe(expected);
    });

    it.each([
        [""],
        ["   "],
        ["not-an-ip"],
        ["999.1.1.1/24"],
        ["10.0.0.1/33"],
        ["10.0.0.1/-1"],
        ["10.0.0.1/24/24"],
        ["10.0.0"],
        ["gggg::1"],
        ["2001:db8::/129"],
    ])("rejects %s with a user-safe message", (value) => {
        const error = validateIpOrCidrInput(value);
        expect(error).not.toBeNull();
        expect(typeof error).toBe("string");
    });
});

describe("parseIpOrCidr", () => {
    it("defaults to a full-length prefix when none is given", () => {
        const v4 = parseIpOrCidr("10.0.0.1");
        expect(v4).toEqual({ valid: true, ip: "10.0.0.1", version: 4, prefixLength: 32 });

        const v6 = parseIpOrCidr("::1");
        expect(v6).toEqual({ valid: true, ip: "::1", version: 6, prefixLength: 128 });
    });
});

describe("currentIpCoveredByRule", () => {
    it("returns true when the current IP is inside the CIDR range", () => {
        expect(currentIpCoveredByRule("192.168.1.42", "192.168.1.0/24")).toBe(true);
    });

    it("returns false when the current IP is outside the CIDR range", () => {
        expect(currentIpCoveredByRule("10.0.0.1", "192.168.1.0/24")).toBe(false);
    });

    it("returns true for an exact bare-IP match", () => {
        expect(currentIpCoveredByRule("10.0.0.1", "10.0.0.1")).toBe(true);
    });

    it("returns false for a bare-IP mismatch", () => {
        expect(currentIpCoveredByRule("10.0.0.2", "10.0.0.1")).toBe(false);
    });

    it("handles IPv6 CIDR containment", () => {
        expect(currentIpCoveredByRule("2001:db8::abcd", "2001:db8::/32")).toBe(true);
        expect(currentIpCoveredByRule("2001:db9::abcd", "2001:db8::/32")).toBe(false);
    });

    it("returns null when currentIp is unknown", () => {
        expect(currentIpCoveredByRule(null, "10.0.0.0/24")).toBeNull();
    });

    it("returns null when the range input is invalid", () => {
        expect(currentIpCoveredByRule("10.0.0.1", "not-a-cidr")).toBeNull();
    });

    it("returns null when IP versions differ", () => {
        expect(currentIpCoveredByRule("2001:db8::1", "10.0.0.0/24")).toBeNull();
    });
});
