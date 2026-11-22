import path from "node:path";
import { describe, expect, it } from "vitest";

import { ROOT, contents, job, runStep, step } from "./chaos-3017-ci-contract-helpers.mjs";

const WORKFLOW = path.join(ROOT, ".github/workflows/tests.yml");
const SUITES = [
    ["customer-push", "e2e-customer-push"],
    ["navigation", "e2e-navigation"],
    ["onboarding", "e2e-onboarding"],
    ["context-fabric", "e2e-context-fabric"],
];

// CHAOS-14495: run_tests.sh empties the results and report roots at the start of each suite, so four suites on one root
// leave only the last suite's junit.xml; and a plain `run:` step is skipped after the first red suite.
describe("CHAOS-14495 e2e-onboarding JUnit", () => {
    const onboarding = () => job(contents(WORKFLOW), "e2e-onboarding");

    it("empties the artifact roots at the start of every suite (the reason for one root per suite)", () => {
        expect(contents(path.join(ROOT, "ci/run_tests.sh"))).toContain(
            'rm -rf "${PLAYWRIGHT_REPORT_ROOT}" "${PLAYWRIGHT_RESULTS_ROOT}"',
        );
    });

    it.each(SUITES)(
        "runs %s after an earlier suite failed, on its own results root",
        (name, tier) => {
            const block = runStep(onboarding(), `bash ci/run_tests.sh ${tier}`);
            expect(block).toMatch(/^ {14}if: \$\{\{ !cancelled\(\) \}\}$/mu);
            expect(block).toMatch(
                new RegExp(`^ {18}PLAYWRIGHT_RESULTS_DIR: test-results/playwright-${name}$`, "mu"),
            );
        },
    );

    it("gives the four suites four different roots", () => {
        const roots = SUITES.map(
            ([, tier]) =>
                /PLAYWRIGHT_RESULTS_DIR: (\S+)/u.exec(
                    runStep(onboarding(), `bash ci/run_tests.sh ${tier}`),
                )?.[1],
        );
        expect(new Set(roots).size).toBe(SUITES.length);
        for (const root of roots) {
            expect(root).toMatch(/^test-results\/[A-Za-z0-9._/-]+$/u);
        }
    });

    it("uploads the results and the report root of every suite, always", () => {
        const results = step(onboarding(), "Upload Playwright raw results and JUnit");
        const report = step(onboarding(), "Upload Playwright report");
        for (const block of [results, report]) {
            expect(block).toMatch(/^ {14}if: always\(\)$/mu);
        }
        for (const [name] of SUITES) {
            expect(results).toContain(`test-results/playwright-${name}/`);
            expect(report).toContain(`test-results/playwright-${name}-html/`);
        }
        expect(results).not.toMatch(/path: test-results\/playwright\/$/mu);
    });
});
