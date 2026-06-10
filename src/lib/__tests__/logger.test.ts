import { describe, expect, it } from "vitest";

import { serializeErrors } from "../logger";

describe("serializeErrors (browser logger Error serialization)", () => {
    it("converts an Error value to a plain { name, message, stack } object", () => {
        const err = new Error("boom");
        const out = serializeErrors({ err, digest: "abc" }) as Record<
            string,
            { name: string; message: string; stack: string }
        > & { digest: string };

        // The bug: spreading an Error into a plain object yields {}, which
        // serializes/prints as "[object Error]" and loses message + stack.
        expect(out.err.name).toBe("Error");
        expect(out.err.message).toBe("boom");
        expect(typeof out.err.stack).toBe("string");
        expect(out.digest).toBe("abc");
        expect(String(out.err)).not.toBe("[object Error]");
    });

    it("serializes a top-level Error argument", () => {
        const out = serializeErrors(new Error("top")) as {
            message: string;
            name: string;
        };
        expect(out.message).toBe("top");
        expect(out.name).toBe("Error");
    });

    it("leaves non-Error values untouched", () => {
        const input = { a: 1, b: "two", c: { nested: true } };
        expect(serializeErrors(input)).toEqual(input);
        expect(serializeErrors("plain")).toBe("plain");
        expect(serializeErrors(null)).toBe(null);
    });
});
