/**
 * CHAOS-7877: `PrTestOpsSummary` had no importer outside its own test, so it was deleted rather
 * than restyled. This keeps it from coming back unused: no file under `src` or `tests` names it.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SELF = "src/components/__tests__/noPrTestOpsSummary.test.ts";

const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "__generated__") continue;
            walk(full, out);
        } else if (/\.(ts|tsx|mjs|cjs|md|mdx)$/u.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
};

describe("PrTestOpsSummary stays deleted (CHAOS-7877)", () => {
    it("the component file is gone", () => {
        expect(existsSync(join(ROOT, "src/components/testops/PrTestOpsSummary.tsx"))).toBe(false);
    });

    it("no source, test or doc file names it", () => {
        const files = ["src", "tests", "docs"]
            .filter((d) => existsSync(join(ROOT, d)))
            .flatMap((d) => walk(join(ROOT, d)))
            .map((f) => relative(ROOT, f))
            .filter((f) => f !== SELF);
        expect(files.length).toBeGreaterThan(100);

        const hits = files.filter((f) =>
            readFileSync(join(ROOT, f), "utf-8").includes("PrTestOpsSummary"),
        );
        expect(hits).toEqual([]);
    });
});
