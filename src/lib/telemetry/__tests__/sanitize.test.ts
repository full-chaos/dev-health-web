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

    it("drops unsafe keys and non-primitives", () => {
        expect(
            accepted({
                email: "a@example.com",
                name: "Ada",
                stack: "trace",
                ok: "yes",
                nested: { a: 1 },
                skipped: undefined,
            }),
        ).toEqual({ ok: "yes" });
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
        "feature.sub:name-1",
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
