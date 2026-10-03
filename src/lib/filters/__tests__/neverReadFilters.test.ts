/**
 * CHAOS-7799: no query reads `who.roles`, `what.artifacts`, `why.issue_type`, `how.flow_stage` or
 * `how.blocked`, so the web has no model field, input, pill, count, chip or fetcher variable for
 * them. A URL written before the removal still decodes: `encode.ts` drops the five keys (tested in
 * `encode.test.ts`).
 */
import { readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { sourceFiles } from "@/test/sourceTree";

const ROOT = join(__dirname, "..", "..", "..", "..");

const TREES = [
    "src/components/filters",
    "src/components/shell",
    "src/lib/filters",
    "src/lib/graphql/investmentFetchers.ts",
    "src/lib/graphql/investmentHydration.ts",
    "src/lib/graphql/hooks/useInvestment.ts",
    "src/app/(app)/explore/page.tsx",
];

/** The one place that names the five keys, to drop them from an old URL. */
const ALLOWED = new Set(["src/lib/filters/encode.ts"]);

const REMOVED =
    /\b(issue_type|flow_stage|issueType|flowStage|onClearRole|onClearArtifact|onClearBlocked|updateRoles|updateArtifacts)\b|\.(roles|artifacts|blocked)\b|\b(roles|artifacts|blocked)\??:/;

const isTest = (path: string) =>
    /\.(test|spec)\.[tj]sx?$/.test(path) || path.includes("__snapshots__");

// A listed root must exist (statSync throws); below it, `sourceFiles` skips dot-entries and files
// deleted mid-scan by other test workers (CHAOS-8258).
const files = (path: string): string[] => {
    const full = join(ROOT, path);
    if (statSync(full).isFile()) return [path];
    return sourceFiles(full).map((abs) => relative(ROOT, abs));
};

describe("the never-read filters are gone from the web (CHAOS-7799)", () => {
    const sources = TREES.flatMap(files).filter((f) => !isTest(f) && !ALLOWED.has(f));

    it("scans real source files", () => {
        expect(sources.length).toBeGreaterThan(20);
    });

    it.each(sources)("%s does not name a removed filter", (file) => {
        const text = readFileSync(join(ROOT, file), "utf-8");
        const hits = text
            .split("\n")
            .map((line, i) => ({ line, n: i + 1 }))
            .filter(
                ({ line }) =>
                    REMOVED.test(line) &&
                    !line.trim().startsWith("*") &&
                    !line.trim().startsWith("//"),
            );
        expect(hits.map(({ n, line }) => `${relative(".", file)}:${n} ${line.trim()}`)).toEqual([]);
    });

    it("the section for flow stage and blocked is not a component any more", () => {
        expect(sources.some((f) => f.endsWith("HowSection.tsx"))).toBe(false);
    });
});
