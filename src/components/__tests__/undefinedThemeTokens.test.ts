import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-2248: a `var(--x)` / Tailwind `(--x)` reference to a custom property that no
 * stylesheet, inline style or font loader defines resolves to nothing (transparent
 * background, inherited colour). This scan fails on any such reference under `src`.
 */
const SRC = join(process.cwd(), "src");
const IGNORED_DIRS = new Set(["__tests__", "__generated__", "node_modules"]);
// Set by Tailwind plugins at build time, never declared in our CSS.
const PLUGIN_PREFIXES = ["--tw-"];

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) walk(full, out);
        } else if (/\.(css|ts|tsx)$/u.test(entry.name) && !/\.(test|stories)\./u.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
}

function findUndefinedTokens(files: Record<string, string>): Record<string, string[]> {
    const defined = new Set<string>();
    const used: Array<[string, string]> = [];
    for (const [file, raw] of Object.entries(files)) {
        const text = stripComments(raw);
        for (const m of text.matchAll(/(--[A-Za-z0-9_-]+)\s*:/gu)) defined.add(m[1]);
        for (const m of text.matchAll(/["'`](--[A-Za-z0-9_-]+)["'`]/gu)) defined.add(m[1]);
        for (const m of text.matchAll(/(?:var\(|\()\s*(--[A-Za-z0-9_-]+)/gu))
            used.push([file, m[1]]);
    }
    const missing: Record<string, string[]> = {};
    for (const [file, token] of used) {
        if (defined.has(token) || PLUGIN_PREFIXES.some((p) => token.startsWith(p))) continue;
        const files = (missing[token] ??= []);
        if (!files.includes(file)) files.push(file);
    }
    return missing;
}

describe("undefined theme tokens", () => {
    it("flags a token that nothing defines", () => {
        const found = findUndefinedTokens({
            "a.css": ":root { --surface: #fff; }",
            "b.tsx": 'const c = "bg-(--surface-base) text-(--surface) var(--ink-base)";',
        });
        expect(Object.keys(found).sort()).toEqual(["--ink-base", "--surface-base"]);
    });

    it("every referenced custom property is defined", () => {
        const files: Record<string, string> = {};
        for (const file of walk(SRC)) files[relative(SRC, file)] = readFileSync(file, "utf8");
        expect(findUndefinedTokens(files)).toEqual({});
    });
});
