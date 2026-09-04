/**
 * Guards the stale-dev-chunk clear in `prepare_playwright_artifacts`, and the
 * scoping that makes it safe.
 *
 * The `ci` tier runs `pnpm build` (writing `.next/`) and then Playwright starts
 * `next dev` (using `.next/dev`). A local checkout carrying a `.next` from
 * earlier work serves stale chunks against the current tree, and the symptom is
 * not a build error — it is unrelated PRODUCT specs going red, because a broken
 * `app/global-error.tsx` chunk stops an error toast rendering and a post-signin
 * redirect completing.
 *
 * Two properties have to hold, and the second is the one a well-meaning
 * simplification breaks:
 *
 * 1. the dev chunks ARE cleared before an e2e suite runs;
 * 2. the PRODUCTION build is NOT — widening this to `rm -rf .next` would
 *    discard the build the same tier just made, so the e2e stage would silently
 *    stop exercising it. Nothing would fail; the suite would simply stop
 *    covering the artifact it is supposed to cover, which is the worse outcome
 *    because it still reports green.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SCRIPT_PATH = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "ci",
    "run_tests.sh",
);

function scriptText() {
    return readFileSync(SCRIPT_PATH, "utf8");
}

function functionBody(source, name) {
    const start = source.indexOf(`${name}() {`);
    if (start === -1) throw new Error(`Could not find shell function "${name}" in run_tests.sh.`);
    const end = source.indexOf("\n}", start);
    if (end === -1) throw new Error(`Could not find the end of "${name}".`);
    return source.slice(start, end);
}

describe("e2e preparation clears stale dev chunks", () => {
    it("removes .next/dev before an e2e suite runs", () => {
        const body = functionBody(scriptText(), "prepare_playwright_artifacts");
        expect(body).toMatch(/rm\s+-rf\s+\.next\/dev\b/u);
    });

    it("never removes the whole .next directory, which holds the production build", () => {
        // `rm -rf .next` not followed by a path separator: the widening that
        // would silently stop the e2e stage exercising the built app.
        const unscoped = /rm\s+-rf\s+(?:"?\$\{?[A-Za-z_]+\}?"?\s+)*\.next(?![/\w])/u;
        expect(scriptText()).not.toMatch(unscoped);
    });

    it("clears the chunks in the shared preparation step, not one suite's own path", () => {
        // Every isolated suite routes through prepare_playwright_artifacts, so
        // placing the clear there covers default/onboarding/context-fabric and
        // anything added later. A clear that lived in only one suite's helper
        // would leave the others on stale chunks.
        const source = scriptText();
        expect(functionBody(source, "run_isolated_e2e_suite")).toMatch(
            /prepare_playwright_artifacts/u,
        );
        expect(functionBody(source, "run_e2e")).toMatch(/prepare_playwright_artifacts/u);
    });
});
