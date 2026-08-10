/**
 * Guards a cross-file invariant that is invisible from either side alone.
 *
 * `tests/ask-dev-vocabulary.spec.ts` cross-checks the sanctioned label maps in
 * `AskDevAnswer.tsx` against the pinned JSON Schema enums, and it does so by
 * reading that file as TEXT — it cannot import the module, because the "use
 * client" import graph reaches a PNG asset that Playwright's standalone esbuild
 * transform has no loader for. Its parser locates `export const <NAME>`, then
 * the next `{`, then the next `};`, and takes the `key:` lines between them.
 *
 * That makes two things load-bearing which nothing in `AskDevAnswer.tsx`
 * declares:
 *
 * 1. Both maps must physically live in that file. Extracting them to a sibling
 *    module (as the answer-section extraction was otherwise free to do) makes
 *    the Playwright parser throw — loudly, but only in the slow e2e tier, with
 *    a cause invisible from the constant's new home.
 * 2. The region between the map's opening `{` and the FIRST following `};`
 *    must be exactly the map body. A nested object literal, or a comment
 *    containing `};`, silently truncates or extends the parsed region — and
 *    then the Playwright assertion compares a WRONG key set against the schema
 *    enum. It would still pass or fail for reasons unrelated to the real
 *    vocabulary, which is the worse outcome: a check that no longer measures
 *    what it claims to.
 *
 * This test re-derives the same parse in the fast unit tier and asserts it
 * agrees with what the module actually exports. It fails in seconds on a
 * refactor that would otherwise fail late, or silently stop measuring.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ANSWER_STATUS_LABELS, SCOPE_OUTCOME_LABELS } from "./AskDevAnswer";

const SOURCE_PATH = path.join(__dirname, "AskDevAnswer.tsx");

/**
 * A deliberate duplicate of `exportedLabelMapKeys` in
 * `tests/ask-dev-vocabulary.spec.ts`. Duplicated rather than shared on
 * purpose: the point is to exercise the same fragile text parse the e2e spec
 * performs, against the same real file, without importing anything from the
 * Playwright tier.
 */
function exportedLabelMapKeys(sourceText: string, exportName: string): readonly string[] {
    const start = sourceText.indexOf(`export const ${exportName}`);
    if (start === -1) throw new Error(`Could not find "export const ${exportName}" in source.`);
    const openBrace = sourceText.indexOf("{", start);
    const closeBrace = sourceText.indexOf("};", openBrace);
    if (openBrace === -1 || closeBrace === -1) {
        throw new Error(`Could not find the object literal body for "${exportName}".`);
    }
    const body = sourceText.slice(openBrace + 1, closeBrace);
    const keyPattern = /^\s*([a-z][a-z0-9_]*)\s*:/gmu;
    const keys: string[] = [];
    for (const match of body.matchAll(keyPattern)) keys.push(match[1]!);
    if (keys.length === 0)
        throw new Error(`Found no keys for "${exportName}" — parsing likely broke.`);
    return keys;
}

describe("sanctioned label maps stay text-parseable in AskDevAnswer.tsx", () => {
    const cases = [
        ["ANSWER_STATUS_LABELS", ANSWER_STATUS_LABELS],
        ["SCOPE_OUTCOME_LABELS", SCOPE_OUTCOME_LABELS],
    ] as const;

    it.each(cases)(
        "%s parses out of the real source to exactly the keys the module exports",
        (exportName, map) => {
            const source = readFileSync(SOURCE_PATH, "utf8");
            const parsed = exportedLabelMapKeys(source, exportName).slice().sort();
            expect(parsed).toEqual(Object.keys(map).slice().sort());
        },
    );

    it.each(cases)("%s has no duplicate keys in the parsed region", (exportName) => {
        const source = readFileSync(SOURCE_PATH, "utf8");
        const parsed = exportedLabelMapKeys(source, exportName);
        // A parsed region that swallowed a NEIGHBOURING map would still match
        // the module's key set under a plain sort+compare if the neighbour is a
        // subset; a duplicate key is the signal that the slice ran past its own
        // literal.
        expect(new Set(parsed).size).toBe(parsed.length);
    });
});
