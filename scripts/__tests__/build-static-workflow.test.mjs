import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = path.join(ROOT, ".github/workflows/build-static.yml");

describe("static build E2E artifact retention", () => {
    it("uploads the generated HTML and raw Playwright artifact roots", () => {
        const workflow = fs.readFileSync(WORKFLOW, "utf8");

        expect(workflow).toContain("path: test-results/playwright-html/");
        expect(workflow).toContain("path: test-results/playwright/");
        expect(workflow).not.toContain("path: playwright-report/");
    });
});
