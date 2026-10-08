import { describe, expect, it } from "vitest";
import { toSameSiteHref } from "../sameSiteHref";

const ORIGIN = "https://app.example.com";

describe("toSameSiteHref", () => {
    it("accepts relative paths", () => {
        expect(toSameSiteHref("/org/admin/sync/abc?x=1#y")).toBe("/org/admin/sync/abc?x=1#y");
    });
    it("accepts absolute URLs on the app origin and returns the path", () => {
        expect(toSameSiteHref(`${ORIGIN}/org/admin?a=1`, ORIGIN)).toBe("/org/admin?a=1");
    });
    it.each([
        ["external URL", "https://evil.example/x"],
        ["protocol-relative", "//evil.example"],
        ["slash-backslash", "/\\evil.example"],
        ["backslash form", "\\\\evil.example"],
        ["javascript scheme", "javascript:alert(1)"],
        ["tab-smuggled", "/\t/evil.example"],
        ["bare host", "evil.example"],
        ["lookalike origin", "https://app.example.com.evil.example/x"],
    ])("refuses %s", (_name, target) => {
        expect(toSameSiteHref(target, ORIGIN)).toBeNull();
    });
    it("refuses absolute URLs when no app origin is given", () => {
        expect(toSameSiteHref(`${ORIGIN}/x`)).toBeNull();
    });
});
