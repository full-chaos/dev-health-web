import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { sourceFiles } from "@/test/sourceTree";

/**
 * CHAOS-8436 (ruling 107): the guard for strings made in `.ts` files. The `.tsx` scan
 * (`components/__tests__/noBackendErrorTextRendered.test.ts`) cannot see `{result.error}` when the
 * string was made in a server action, so this one checks the makers and the renderers:
 *
 * 1. MAKERS: no `.ts` file builds a failed result (`error: ...`) from `.message`, `.detail` or
 *    `String(err)`. A failed result comes from `failureResult` / `failureFromError` in
 *    `src/lib/actionFailure.ts`, the one place that applies the 4xx rule and logs the detail.
 * 2. RENDERERS: no component prints a server result's error text in JSX (`{result.error}`); a read
 *    page shows `READ_FAILED_MESSAGE`.
 */
const SRC = join(process.cwd(), "src");
const all = sourceFiles(SRC).filter(
    (f) => !/\.(test|spec)\.tsx?$/u.test(f) && !/__(tests|generated)__/u.test(f),
);
const ts = all.filter((f) => /\.ts$/u.test(f));
const tsx = all.filter((f) => /\.tsx$/u.test(f));

/** `error: <expr containing .message / .detail / String(>`: a result made from raw error text. */
const MAKES_RESULT_FROM_TEXT = /\berror:\s*[^,\n}]*(?:\??\.message\b|\??\.detail\b|\bString\()/u;
/** `err instanceof Error ? err.message : ...` anywhere in a `.ts` file. */
const READS_THROWN_TEXT = /instanceof Error \? \w+\.message/u;
/** `{result.error}` / `{xResult.error}` printed as JSX text. */
const PRINTS_RESULT_ERROR = /\{\s*\w*[rR]esult\??\.error\s*\}/u;

const ALLOW_MAKERS: Record<string, string> = {
    "lib/result.ts": "withResult: a test-only helper, no screen uses it",
    "lib/graphql/validate.ts":
        "schema (zod) validation result for the data layer: thrown or logged, never a screen sentence",
};

const ALLOW_RENDERERS: Record<string, string> = {
    "components/admin/ImpersonationBanner.tsx":
        "a toast of an ACTION result; the text is already gated by failureResult (4xx rule)",
};

const rel = (f: string) => relative(SRC, f);
const text = (f: string) => readFileSync(f, "utf8");

describe("strings made in .ts files and printed from results", () => {
    it("scans real file sets (a scan of nothing is a failure)", () => {
        expect(ts.length).toBeGreaterThan(200);
        expect(tsx.length).toBeGreaterThan(200);
    });

    it("the patterns see the shapes they are for", () => {
        expect(
            MAKES_RESULT_FROM_TEXT.test(
                'return { error: err instanceof Error ? err.message : "x" };',
            ),
        ).toBe(true);
        expect(
            MAKES_RESULT_FROM_TEXT.test("return { error: detail.detail || `Failed (${s})` };"),
        ).toBe(true);
        expect(MAKES_RESULT_FROM_TEXT.test("return { error: String(err) };")).toBe(true);
        expect(MAKES_RESULT_FROM_TEXT.test('return { error: "Unauthorized" };')).toBe(false);
        expect(READS_THROWN_TEXT.test("err instanceof Error ? err.message : 'x'")).toBe(true);
        expect(PRINTS_RESULT_ERROR.test("Failed: {plansResult.error}")).toBe(true);
        expect(PRINTS_RESULT_ERROR.test("{READ_FAILED_MESSAGE}")).toBe(false);
    });

    it("no .ts file makes a failed result from raw error text", () => {
        const offenders = ts
            .map(rel)
            .filter((r) => !(r in ALLOW_MAKERS))
            .filter((r) => {
                const t = text(join(SRC, r));
                return MAKES_RESULT_FROM_TEXT.test(t) || READS_THROWN_TEXT.test(t);
            });
        expect(offenders).toEqual([]);
    });

    it("no component prints a server result's error text", () => {
        const offenders = tsx
            .map(rel)
            .filter((r) => !(r in ALLOW_RENDERERS))
            .filter((r) => PRINTS_RESULT_ERROR.test(text(join(SRC, r))));
        expect(offenders).toEqual([]);
    });

    it("keeps the allow-lists honest", () => {
        for (const r of Object.keys(ALLOW_RENDERERS)) {
            expect(PRINTS_RESULT_ERROR.test(text(join(SRC, r))), r).toBe(true);
        }
        for (const r of Object.keys(ALLOW_MAKERS)) {
            const t = text(join(SRC, r));
            expect(MAKES_RESULT_FROM_TEXT.test(t) || READS_THROWN_TEXT.test(t), r).toBe(true);
        }
    });
});
