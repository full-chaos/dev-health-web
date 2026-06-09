/**
 * Browser (jsdom) environment tests for encodeSecurityFilter / decodeSecurityFilter.
 *
 * This file lives alongside security.test.ts but uses the .tsx extension so
 * vitest picks it up under the "components" project (environment: "jsdom") per
 * vitest.config.ts — that's where the Buffer polyfill is active and where the
 * "base64url" encoding bug manifested as:
 *   TypeError: Unknown encoding: base64url
 *
 * The node-env tests in security.test.ts exercise the same code but with
 * Node's native Buffer, which supports "base64url". These tests verify the fix
 * holds specifically in the polyfill context that crashed the browser.
 */

import { describe, expect, it } from "vitest";

import {
    decodeSecurityFilter,
    defaultSecurityFilter,
    encodeSecurityFilter,
} from "@/lib/filters/security";
import type { SecurityFilter } from "@/lib/filters/security";

describe("encodeSecurityFilter / decodeSecurityFilter — browser (jsdom) environment", () => {
    it("round-trips a filter with all three pill dimensions without throwing", () => {
        const filter: SecurityFilter = {
            severities: ["critical", "high"],
            states: ["open", "detected"],
            sources: ["dependabot", "code_scanning"],
        };
        // Must not throw (the "base64url" bug crashed here in jsdom)
        const encoded = encodeSecurityFilter(filter);
        const decoded = decodeSecurityFilter(encoded);
        expect(decoded).toEqual(filter);
    });

    it("round-trips a filter containing non-ASCII values (UTF-8 safety)", () => {
        // Repo and team names can contain accented characters, CJK, emoji, etc.
        const filter: SecurityFilter = {
            severities: ["medium"],
            states: ["open"],
            sources: ["advisory"],
            search: "répo-名前-🔒",
        };
        const encoded = encodeSecurityFilter(filter);
        expect(() => decodeSecurityFilter(encoded)).not.toThrow();
        const decoded = decodeSecurityFilter(encoded);
        expect(decoded).toEqual(filter);
    });

    it("encoded value is a valid base64url string (no +, /, or = characters)", () => {
        const encoded = encodeSecurityFilter({ severities: ["critical"], openOnly: true });
        expect(encoded).not.toMatch(/[+/=]/);
    });

    it("decodeSecurityFilter returns default when given undefined", () => {
        expect(decodeSecurityFilter(undefined)).toEqual(defaultSecurityFilter());
    });

    it("decodeSecurityFilter returns default on invalid input without throwing", () => {
        expect(() => decodeSecurityFilter("!!!not-valid!!!")).not.toThrow();
        expect(decodeSecurityFilter("!!!not-valid!!!")).toEqual(defaultSecurityFilter());
    });
});
