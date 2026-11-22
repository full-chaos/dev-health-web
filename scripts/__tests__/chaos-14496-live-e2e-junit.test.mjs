import path from "node:path";
import { describe, expect, it } from "vitest";

import { ROOT, contents, job, step } from "./chaos-3017-ci-contract-helpers.mjs";

// CHAOS-14496: every live tier writes a JUnit file per pass and uploads it with the tier's report artifact. The html reporter empties
// playwright-report at the start of every pass, so the JUnit lives in its own directory, one file per pass label.
describe("CHAOS-14496 live-e2e JUnit", () => {
    const config = () => contents(path.join(ROOT, "playwright.live.config.ts"));
    const harness = () => contents(path.join(ROOT, "ci/run_tests.sh"));
    const workflow = () => contents(path.join(ROOT, ".github/workflows/live-e2e.yml"));

    it("adds a junit reporter outside playwright-report", () => {
        expect(config()).toMatch(
            /\["junit", \{ outputFile: process\.env\.LIVE_E2E_JUNIT \?\? "live-junit\/junit\.xml" \}\]/u,
        );
    });

    it("names the JUnit file of each pass by its label and clears it first", () => {
        const body = /^run_live_e2e\(\) \{\n[\s\S]*?^\}\n/mu.exec(harness())?.[0] ?? "";
        expect(body).toContain('local junit="live-junit/${LIVE_E2E_LABEL:-default}.xml"');
        expect(body).toContain('rm -f "${json}" "${junit}"');
        expect(body).toContain('LIVE_E2E_JUNIT="${junit}" run_pnpm_script test:e2e:live');
    });

    it("uploads live-junit with the report of every tier, always, without a new artifact", () => {
        const live = job(workflow(), "live-e2e");
        const upload = step(live, "Upload Playwright report");
        expect(upload).toMatch(/^ {14}if: always\(\)$/mu);
        expect(upload).toMatch(/path: \|\n {22}playwright-report\n {22}live-junit$/mu);
        // one report artifact per tier: no second artifact for the JUnit (the sync reads 25 artifacts per run)
        expect(live.match(/^ {14}name: .*live-junit/gmu)).toBeNull();
    });
});
