import { describe, expect, it } from "vitest";

import { boundTelemetryString, sanitizeTelemetryPayload } from "../sanitize";

const accepted = (payload: Record<string, unknown>) => {
    const result = sanitizeTelemetryPayload(payload);
    if (!result.ok) throw new Error(`rejected key ${result.key}`);
    return result.payload;
};

describe("sanitizeTelemetryPayload", () => {
    it("keeps primitive safe values", () => {
        expect(accepted({ surface: "metrics", count: 2, enabled: true, empty: null })).toEqual({
            surface: "metrics",
            count: 2,
            enabled: true,
            empty: null,
        });
    });

    it("drops denylisted keys whatever their value", () => {
        expect(
            accepted({
                email: "a@example.com",
                name: "Ada",
                stack: "trace",
                orgId: undefined,
                userId: { a: 1 },
                ok: "yes",
            }),
        ).toEqual({ ok: "yes" });
    });

    it.each([
        ["undefined", undefined],
        ["an object", { a: 1 }],
        ["an array", ["a"]],
        ["a Date", new Date(0)],
        ["a function", () => "x"],
        ["a symbol", Symbol("x")],
        ["a bigint", BigInt(1)],
    ])("rejects %s (fail closed, never omitted)", (_label, value) => {
        expect(sanitizeTelemetryPayload({ ok: "fine", view: value })).toEqual({
            ok: false,
            key: "view",
        });
    });

    it("drops a key that is not a plain identifier", () => {
        expect(accepted({ "a b": "x", "9lives": "x", "x-y": "x", fine_key: "x" })).toEqual({
            fine_key: "x",
        });
        expect(accepted({ [`k${"a".repeat(64)}`]: "x" })).toEqual({});
    });

    it.each([
        ["an e-mail shape", "ada@example.com"],
        ["text with a space", "Ada Lovelace"],
        ["a URL", "https://example.com/a"],
        ["a scheme with one slash", "https:/host/p"],
        ["a file scheme", "file:/etc/passwd"],
        ["a script scheme", "javascript:void"],
        ["a script scheme in mixed case", "JaVaScRiPt:void"],
        ["a data scheme", "data:text"],
        ["a host and port", "host:8080/path"],
        ["a colon inside a path", "/https:/victim.example/path"],
        ["a lone colon pair", "a:b"],
        ["a trailing colon", "https:"],
        ["an encoded colon", "https%3A/host"],
        ["a query string", "/people?q=ada"],
        ["a fragment", "/people#ada"],
        ["a percent escape", "/people/ada%40example.com"],
        ["a plus", "a+b"],
        ["a non-ASCII letter", "café"],
        ["a control character", "a\u0000b"],
        ["a newline", "a\nb"],
        ["an empty string", ""],
        ["a string over 128 characters", "a".repeat(129)],
        ["a UUID", "x/00000000-0000-4000-8000-000000000001"],
        ["an upper case UUID", "00000000-0000-4000-8000-00000000000A"],
        ["a 24 character token", "abcdefghijklmnopqrstuvwx"],
        ["a long digit run", "123456789012345678901234"],
        ["a token inside a path", "/x/AbCdEfGhIjKlMnOpQrStUvWxYz0/y"],
    ])("rejects %s", (_label, value) => {
        const result = sanitizeTelemetryPayload({ ok: "fine", view: value });
        expect(result).toEqual({ ok: false, key: "view" });
    });

    it.each([
        ["NaN", Number.NaN],
        ["Infinity", Number.POSITIVE_INFINITY],
        ["-Infinity", Number.NEGATIVE_INFINITY],
    ])("rejects %s", (_label, value) => {
        expect(sanitizeTelemetryPayload({ durationMs: value })).toEqual({
            ok: false,
            key: "durationMs",
        });
    });

    it.each([
        "/people/[person_id]/metrics/[metric]",
        "work_graph",
        "quadrant_panel",
        "TypeError",
        "1234567890",
        "a".repeat(23),
        "a-".repeat(64),
        "feature.sub-name-1",
    ])("accepts %s", (value) => {
        expect(accepted({ view: value })).toEqual({ view: value });
    });

    it("never reports a value, only the key", () => {
        const result = sanitizeTelemetryPayload({ view: "ada@example.com" });
        expect(JSON.stringify(result)).not.toContain("ada");
    });

    it("keeps the key denylist for values that would pass", () => {
        expect(accepted({ orgId: "org-123", userId: "u-1", view: "ok" })).toEqual({ view: "ok" });
    });
});

describe("boundTelemetryString", () => {
    it("returns the value or null", () => {
        expect(boundTelemetryString("/metrics")).toBe("/metrics");
        expect(boundTelemetryString("/people/ada@example.com")).toBeNull();
    });
});

describe("the colon rule", () => {
    it("refuses a colon in any position and in any string field", () => {
        for (const value of [":", "a:", ":a", "a:b:c", "/a/b:c"]) {
            expect(sanitizeTelemetryPayload({ view: value })).toEqual({ ok: false, key: "view" });
            expect(boundTelemetryString(value)).toBeNull();
        }
    });

    it("keeps the double slash refusal as a second guard", () => {
        expect(boundTelemetryString("a//b")).toBeNull();
        expect(boundTelemetryString("/a//b")).toBeNull();
    });

    it("does not decode an encoded colon: the percent sign is refused by its own rule", () => {
        expect(boundTelemetryString("a%3Ab")).toBeNull();
        expect(boundTelemetryString("a%3ab")).toBeNull();
    });

    it("still accepts a plain name and a route pattern", () => {
        expect(boundTelemetryString("quadrant_panel")).toBe("quadrant_panel");
        expect(boundTelemetryString("/people/[person_id]")).toBe("/people/[person_id]");
    });
});
