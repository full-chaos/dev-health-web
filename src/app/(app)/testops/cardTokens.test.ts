import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The TestOps pages draw their own cards (chart cards) with the
// theme tokens: the surface, the border and the radius scale. The old card
// look (3xl radius, the card-stroke border, the translucent card fills) must
// not come back. Charts, tabs, texts and tiles are not part of this check.

const root = join(process.cwd(), "src/app/(app)/testops");
const PAGES = ["page.tsx", "pipelines/page.tsx", "tests/page.tsx", "coverage/page.tsx"];

describe("TestOps cards use the theme tokens", () => {
    it.each(PAGES)("%s has no old card classes", (page) => {
        const source = readFileSync(join(root, page), "utf8");
        expect(source).not.toMatch(/rounded-3xl|rounded-2xl/);
        expect(source).not.toMatch(/border-\(--card-stroke\)/);
        expect(source).not.toMatch(/bg-\(--card(-\d+)?\)/);
    });

    it("has no summary box on the overview: the approved layout starts with the tile strip", () => {
        const source = readFileSync(join(root, "page.tsx"), "utf8").replace(/\s+/g, " ");
        expect(source).not.toContain("TestOps summary");
        // The cards of the overview are the shared Section, not page-local card markup.
        expect(source).toContain("<Section");
        expect(source).not.toMatch(/rounded-\(--radius-lg\) border border-\(--border\)/);
    });

    it("keeps the Pipelines denominators note", () => {
        const source = readFileSync(join(root, "pipelines/page.tsx"), "utf8").replace(/\s+/g, " ");
        expect(source).toContain("need not sum to 100%");
        expect(source).toContain("a different denominator from the headline Failure Rate");
    });
});
