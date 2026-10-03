/**
 * CHAOS-8545: the logo is one SVG file, `src/assets/fc-logo.svg`.
 *
 * This repository is public. The logo came from a vector editor, which writes
 * its own data into the file (document name, export file name, window state).
 * The committed file has that data removed. This test keeps it out, and keeps
 * the file a plain drawing: no embedded picture, no script, no outside
 * resource. It also checks that the 5 MB PNG that the SVG replaced is gone and
 * that no source file imports it.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOGO = path.join(ROOT, "src/assets/fc-logo.svg");
/** The file is 22,065 bytes. A much larger file is not this drawing. */
const MAX_BYTES = 25_000;

function sourceFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.(ts|tsx|js|jsx|mjs|css)$/.test(entry.name) ? [full] : [];
    });
}

describe("logo asset (CHAOS-8545)", () => {
    const svg = readFileSync(LOGO, "utf8");
    const root = svg.match(/<svg\b[^>]*>/)?.[0] ?? "";

    it("has no vector editor data and no local path", () => {
        expect(svg).not.toMatch(/sodipodi|inkscape/i);
        expect(svg).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\|file:/);
    });

    it("is a plain drawing: no embedded picture, no script, no outside resource", () => {
        expect(svg).not.toMatch(/<image\b|<script\b|<foreignObject\b|base64/i);
        const links = [...svg.matchAll(/\bhref="([^"]*)"/g)].map((match) => match[1]);
        expect(links.filter((link) => !link.startsWith("#"))).toEqual([]);
    });

    it("keeps its box, its name for assistive technology and all of its shapes", () => {
        expect(root).toContain('viewBox="0 0 3200 3100"');
        expect(root).toContain('width="3200"');
        expect(root).toContain('height="3100"');
        expect(root).toContain('role="img"');
        expect(root).toContain('aria-labelledby="logo-title logo-description"');
        expect(svg).toMatch(/<title\s+id="logo-title"/);
        expect(svg).toMatch(/<desc\s+id="logo-description"/);
        expect(svg.match(/<path\b/g)).toHaveLength(20);
        expect(svg.match(/<(linear|radial)Gradient\b/g)).toHaveLength(23);
    });

    it("is below 25 kB", () => {
        expect(statSync(LOGO).size).toBeLessThan(MAX_BYTES);
    });

    it("replaced the 5 MB PNG: the file is gone and no source file imports it", () => {
        expect(existsSync(path.join(ROOT, "src/assets/fc-logo.png"))).toBe(false);
        const importers = sourceFiles(path.join(ROOT, "src"))
            .filter((file) => /assets\/fc-logo\.png/.test(readFileSync(file, "utf8")))
            .map((file) => path.relative(ROOT, file));
        expect(importers).toEqual([]);
    });
});
