import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasLoadTimeout, LOAD_TIMEOUT_FILES, LOAD_TIMEOUT_MS } from "@/test/loadTimeouts";

describe("load timeouts (CHAOS-12901)", () => {
    it("keeps a finite, bounded limit", () => {
        expect(LOAD_TIMEOUT_MS.test).toBeGreaterThan(5_000);
        expect(LOAD_TIMEOUT_MS.test).toBeLessThanOrEqual(60_000);
        expect(LOAD_TIMEOUT_MS.hook).toBeGreaterThan(10_000);
        expect(LOAD_TIMEOUT_MS.hook).toBeLessThanOrEqual(60_000);
    });

    it("lists only files that exist", () => {
        for (const file of LOAD_TIMEOUT_FILES) {
            expect(existsSync(path.resolve(__dirname, "../../..", file)), file).toBe(true);
        }
    });

    it("matches by repo-relative or absolute path, and nothing else", () => {
        const [first] = LOAD_TIMEOUT_FILES;
        expect(hasLoadTimeout(first)).toBe(true);
        expect(hasLoadTimeout(`/work/web/${first}`)).toBe(true);
        expect(hasLoadTimeout("src/lib/__tests__/other.test.ts")).toBe(false);
        expect(hasLoadTimeout(undefined)).toBe(false);
    });
});
