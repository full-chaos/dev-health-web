import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const scanRoots = ["src/app/(app)/superadmin", "src/components/admin"];

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return name === "__tests__" ? [] : walk(full);
        return /\.tsx$/u.test(name) && !/\.test\.tsx$/u.test(name) ? [full] : [];
    });

/** Every href="/superadmin/..." and href={`/superadmin/...`} literal in a file. */
const extractHrefs = (source: string): string[] => {
    const out: string[] = [];
    const re = /href=(?:"(\/superadmin[^"]*)"|\{`(\/superadmin[^`]*)`\})/gu;
    for (const m of source.matchAll(re)) out.push(m[1] ?? m[2]);
    return out;
};

const pageDirs = (segments: string[], base: string): boolean => {
    if (segments.length === 0) return existsSync(join(base, "page.tsx"));
    const [head, ...rest] = segments;
    const isDynamic = head.includes("${");
    if (!existsSync(base)) return false;
    const candidates = isDynamic
        ? readdirSync(base).filter(
              (n) => /^\[.+\]$/u.test(n) && statSync(join(base, n)).isDirectory(),
          )
        : [head];
    return candidates.some((c) => pageDirs(rest, join(base, c)));
};

const resolves = (href: string): boolean => {
    const path = href.split("?")[0].split("#")[0];
    const segments = path.split("/").filter(Boolean);
    return pageDirs(segments, join(root, "src/app/(app)"));
};

describe("platform-admin links resolve to a page (CHAOS-8967)", () => {
    const hrefs = scanRoots.flatMap((r) =>
        walk(join(root, r)).flatMap((f) =>
            extractHrefs(readFileSync(f, "utf8")).map((h) => ({ f, h })),
        ),
    );

    it("finds platform-admin links to check", () => {
        expect(hrefs.length).toBeGreaterThan(0);
    });

    it("every /superadmin href has a page.tsx", () => {
        const dead = hrefs
            .filter(({ h }) => !resolves(h))
            .map(({ f, h }) => `${h}  (in ${f.replace(root + "/", "")})`);
        expect(dead).toEqual([]);
    });
});
