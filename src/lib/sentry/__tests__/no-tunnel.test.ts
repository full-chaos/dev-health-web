import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("sentry tunnel", () => {
    it("next.config.js sets no tunnelRoute", () => {
        const source = readFileSync(resolve(__dirname, "../../../../next.config.js"), "utf8");
        expect(source).not.toMatch(/^\s*tunnelRoute\s*:/m);
    });
});
