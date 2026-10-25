import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guard: the only digest code in the telemetry pipeline is hash.ts, and it is
 * SHA-256 through SubtleCrypto. The rules look at code shape, not at a hash name, so a weak
 * hash under any name still fails.
 */
const ROOTS = ["src/lib/telemetry", "src/lib/onboarding", "src/components/telemetry"];
const HASH_FILE = "src/lib/telemetry/hash.ts";

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            if (entry === "__tests__" || entry === "node_modules") continue;
            sourceFiles(path, out);
        } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
            out.push(path);
        }
    }
    return out;
}

function stripComments(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

type GuardFile = { file: string; code: string };

function loadGuardFiles(root = process.cwd()): GuardFile[] {
    return ROOTS.flatMap((dir) => sourceFiles(join(root, dir))).map((path) => ({
        file: relative(root, path),
        code: stripComments(readFileSync(path, "utf8")),
    }));
}

// Digest primitives that may appear only in the hash file.
const DIGEST_PRIMITIVE = /\.digest\s*\(|createHash|crypto-js|js-sha|sha-?1\b|md5/i;
// Shapes a hand-rolled hash needs, under any function name.
const WEAK_SHAPES: Array<[string, RegExp]> = [
    ["Math.imul", /Math\s*\.\s*imul/],
    ["unsigned 32-bit coercion", />>>\s*0\b/],
    ["number to hex", /\.toString\(\s*16\s*\)/],
];

function guardViolations(files: GuardFile[]): string[] {
    const out: string[] = [];
    for (const { file, code } of files) {
        const isHash = file === HASH_FILE;
        if (!isHash && DIGEST_PRIMITIVE.test(code))
            out.push(`${file}: digest primitive outside hash.ts`);
        if (!isHash) {
            for (const [label, shape] of WEAK_SHAPES) {
                if (shape.test(code)) out.push(`${file}: ${label}`);
            }
        }
        if (isHash) {
            const calls = [...code.matchAll(/\.digest\s*\(([^)]*)\)/g)].map((m) => m[1] ?? "");
            if (calls.length !== 1)
                out.push(`${file}: expected exactly one digest call, found ${calls.length}`);
            for (const args of calls) {
                if (!/^\s*"SHA-256"\s*,/.test(args))
                    out.push(`${file}: digest not called with the literal "SHA-256"`);
            }
            if (/Math\s*\.\s*imul|>>>\s*0\b/.test(code)) out.push(`${file}: weak hash shape`);
        }
    }
    return out;
}

describe("digest code guard", () => {
    it("finds the telemetry sources and refuses nothing in today's tree", () => {
        const files = loadGuardFiles();
        expect(files.length).toBeGreaterThan(10);
        expect(files.some((f) => f.file === HASH_FILE)).toBe(true);
        expect(guardViolations(files)).toEqual([]);
    });

    it("refuses a renamed bit-mixing hash anywhere in the telemetry code", () => {
        const weak = `export function h31(s: string): string {
            let h = 0;
            for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
            return (h >>> 0).toString(16);
        }`;
        const files = [...loadGuardFiles(), { file: "src/lib/telemetry/queue.ts", code: weak }];
        const found = guardViolations(files);
        expect(found).toEqual(
            expect.arrayContaining([
                "src/lib/telemetry/queue.ts: Math.imul",
                "src/lib/telemetry/queue.ts: unsigned 32-bit coercion",
            ]),
        );
    });

    it("refuses a non-SHA-256 digest in hash.ts", () => {
        const files = loadGuardFiles().map((f) =>
            f.file === HASH_FILE ? { ...f, code: f.code.replace('"SHA-256"', '"SHA-1"') } : f,
        );
        expect(guardViolations(files)).toContain(
            `${HASH_FILE}: digest not called with the literal "SHA-256"`,
        );
    });

    it("refuses a digest call outside hash.ts", () => {
        const files = [
            ...loadGuardFiles(),
            {
                file: "src/lib/onboarding/track.ts",
                code: 'const d = await globalThis.crypto.subtle.digest("SHA-256", bytes);',
            },
        ];
        expect(guardViolations(files)).toContain(
            "src/lib/onboarding/track.ts: digest primitive outside hash.ts",
        );
    });
});
