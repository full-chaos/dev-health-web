import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../../..");
const SKIP = new Set(["node_modules", ".next", ".git", "__tests__", "test", "tests", "e2e"]);

function walk(dir: string, top: boolean, out: string[]): void {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
            if (!top) walk(full, false, out);
        } else if (/\.(?:[cm]?[jt]sx?)$/u.test(name) && !/\.test\./u.test(name)) {
            out.push(full);
        }
    }
}

function sourceFiles(): string[] {
    const files: string[] = [];
    walk(path.join(ROOT, "src"), false, files);
    walk(ROOT, true, files);
    return files;
}

describe("Sentry user source", () => {
    it("scans the source tree", () => {
        expect(sourceFiles().length).toBeGreaterThan(100);
    });

    // D6247: a user set at the source carries the id and nothing else, so an envelope item that
    // skips beforeSend (replay, session) never sees more.
    it("passes only an id to every setUser call in application code", () => {
        const offenders: string[] = [];
        for (const file of sourceFiles()) {
            const text = readFileSync(file, "utf8");
            for (const call of text.matchAll(/\bsetUser\s*\(([^)]*)\)/gu)) {
                const arg = call[1].trim();
                if (arg === "null" || /^\{\s*id\s*(?::\s*[^,{}]+)?\s*,?\s*\}$/u.test(arg)) continue;
                offenders.push(`${path.relative(ROOT, file)}: setUser(${arg})`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
