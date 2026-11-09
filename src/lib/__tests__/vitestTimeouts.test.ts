import { describe, expect, it } from "vitest";
import config from "../../../vitest.config";

describe("vitest timeouts (CHAOS-12901)", () => {
    const test = config.test ?? {};

    it("sets one finite bound above the vitest defaults", () => {
        expect(test.testTimeout).toBeGreaterThan(5_000);
        expect(test.testTimeout).toBeLessThanOrEqual(60_000);
        expect(test.hookTimeout).toBeGreaterThan(10_000);
        expect(test.hookTimeout).toBeLessThanOrEqual(60_000);
    });

    it("applies the bound to every project", () => {
        for (const project of test.projects ?? []) {
            expect(project).toMatchObject({ extends: true });
            const own =
                (project as { test?: { testTimeout?: number; hookTimeout?: number } }).test ?? {};
            expect(own.testTimeout).toBeUndefined();
            expect(own.hookTimeout).toBeUndefined();
        }
    });
});
