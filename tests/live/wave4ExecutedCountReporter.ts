import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

/**
 * CHAOS-3219 Phase 4 Lane 4d — the false-green backstop for the Wave 4 access
 * matrix.
 *
 * The arming checks in `playwright.ask-dev-wave4.config.ts` prove the run was
 * *configured* correctly. They cannot prove it *measured* anything: a bad
 * `--grep`, a stray `test.skip`, a `testMatch` that stops matching after a file
 * rename, or a project filter typo all produce "0 passed" and exit 0. That is
 * exactly the defect this epic already hit once on the Ops side — a correctly
 * armed acceptance run silently reporting `144 skipped, exit 0` (CHAOS-3219
 * Phase 2 exit finding B1). An access matrix that asserts nothing about anyone
 * is indistinguishable from a green one unless the runner refuses to pass.
 *
 * So this reporter turns two silent conditions into hard failures:
 *
 *  1. zero tests executed, and
 *  2. any test skipped — a skip in a release gate is an unmeasured matrix row,
 *     not a pass. Nothing in this suite may opt out at runtime.
 *
 * `onEnd` returning a status overrides the run result (Playwright >= 1.45), so
 * these become a non-zero exit rather than a warning nobody reads.
 */
export default class Wave4ExecutedCountReporter implements Reporter {
    private executed = 0;
    private readonly skipped: string[] = [];
    private readonly listOnly: boolean;

    /**
     * `--list` enumerates tests without running any, so zero-executed is its
     * CORRECT outcome, not a false green. Failing there would break test
     * discovery for CI, editors and anyone inspecting the suite.
     *
     * Playwright constructs reporters with the OPTIONS OBJECT from the reporter
     * tuple in the config — never with argv. An earlier version of this
     * signature took `argv` positionally with a `process.argv` default; the unit
     * tests passed because they injected an array, and the real run died with
     * "argv.includes is not a function" on the first `--list`. Hence the object
     * shape, and hence the end-to-end check in the PR rather than unit tests
     * alone.
     */
    constructor(options: { readonly argv?: readonly string[] } = {}) {
        this.listOnly = (options.argv ?? process.argv).includes("--list");
    }

    onTestEnd(test: TestCase, result: TestResult): void {
        if (result.status === "skipped") {
            this.skipped.push(test.titlePath().filter(Boolean).join(" › "));
            return;
        }
        this.executed += 1;
    }

    // Playwright's own verdict is deliberately not read: returning undefined
    // preserves it, so this guard can only ever turn a pass into a failure —
    // never rescue a genuine failure into a pass.
    onEnd(_result: FullResult): { status: FullResult["status"] } | undefined {
        if (this.listOnly) return undefined;
        const failures: string[] = [];
        if (this.executed === 0) {
            failures.push(
                "The Ask Dev Wave 4 access matrix executed ZERO tests. An armed gate that " +
                    "measured nothing is a false green, not a pass. Check testMatch/testDir, " +
                    "any --grep filter, and that the spec files still exist.",
            );
        }
        if (this.skipped.length > 0) {
            failures.push(
                `The Ask Dev Wave 4 access matrix skipped ${this.skipped.length} test(s). ` +
                    "Every row of this matrix is release evidence; a skipped row is an " +
                    "unmeasured row. Skipped: " +
                    this.skipped.join(", "),
            );
        }
        if (failures.length === 0) return undefined;
        for (const failure of failures) console.error(`\n[ask-dev-wave4] ${failure}\n`);
        return { status: "failed" };
    }

    // Playwright suppresses stdio from the reporter unless this opts out.
    printsToStdio(): boolean {
        return true;
    }

    /** Exposed for the unit-tier control that proves this guard actually fails. */
    get executedCount(): number {
        return this.executed;
    }
}
