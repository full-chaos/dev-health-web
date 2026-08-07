import { describe, expect, it, vi } from "vitest";
import type { FullResult, TestCase, TestResult } from "@playwright/test/reporter";

import Wave4ExecutedCountReporter from "../wave4ExecutedCountReporter";

/**
 * CHAOS-3219 Phase 4 Lane 4d — control for the access matrix's false-green guard.
 *
 * This guard's whole job is to fail a run that measured nothing. That is
 * unprovable from inside the suite it guards (an armed Compose launcher), and
 * a guard nobody watches fail is indistinguishable from one that cannot. So
 * every branch is exercised here, in the required unit job, by feeding the
 * reporter the exact result stream Playwright would.
 */

function testCase(title: string): TestCase {
    return { titlePath: () => ["", "project", "file.spec.ts", title] } as unknown as TestCase;
}

function result(status: TestResult["status"]): TestResult {
    return { status } as TestResult;
}

const PASSED: FullResult = { status: "passed" } as FullResult;

describe("Wave4ExecutedCountReporter", () => {
    it("FAILS a run that executed zero tests, even though Playwright called it passed", () => {
        const reporter = new Wave4ExecutedCountReporter();
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});

        // No onTestEnd at all — the empty-match case: a bad testMatch, a stale
        // filename, a --grep typo. Playwright's own verdict here is "passed".
        const verdict = reporter.onEnd(PASSED);

        expect(reporter.executedCount).toBe(0);
        expect(verdict).toEqual({ status: "failed" });
        expect(errors.mock.calls.flat().join("\n")).toContain("executed ZERO tests");
        errors.mockRestore();
    });

    it("FAILS a run where every test was skipped — the B1 '144 skipped, exit 0' shape", () => {
        const reporter = new Wave4ExecutedCountReporter();
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});

        reporter.onTestEnd(testCase("superadmin reaches validation"), result("skipped"));
        reporter.onTestEnd(testCase("member is denied"), result("skipped"));

        const verdict = reporter.onEnd(PASSED);

        // Skips must not count as measurement — this is the assertion that
        // separates this guard from a plain "did anything happen" counter.
        expect(reporter.executedCount).toBe(0);
        expect(verdict).toEqual({ status: "failed" });
        const message = errors.mock.calls.flat().join("\n");
        expect(message).toContain("skipped 2 test(s)");
        expect(message).toContain("member is denied");
        errors.mockRestore();
    });

    it("FAILS a run that measured real rows but skipped even one", () => {
        const reporter = new Wave4ExecutedCountReporter();
        const errors = vi.spyOn(console, "error").mockImplementation(() => {});

        reporter.onTestEnd(testCase("superadmin reaches validation"), result("passed"));
        reporter.onTestEnd(testCase("impersonation row"), result("skipped"));

        const verdict = reporter.onEnd(PASSED);

        // The partial case is the dangerous one: a green summary with a silently
        // unmeasured matrix row inside it.
        expect(reporter.executedCount).toBe(1);
        expect(verdict).toEqual({ status: "failed" });
        expect(errors.mock.calls.flat().join("\n")).toContain("impersonation row");
        errors.mockRestore();
    });

    it("does NOT override the verdict when tests actually ran and none were skipped", () => {
        const reporter = new Wave4ExecutedCountReporter();

        reporter.onTestEnd(testCase("superadmin reaches validation"), result("passed"));
        reporter.onTestEnd(testCase("member is denied"), result("passed"));

        // undefined means "leave Playwright's verdict alone" — the guard must
        // not manufacture passes OR failures on a run that genuinely measured.
        expect(reporter.onEnd(PASSED)).toBeUndefined();
        expect(reporter.executedCount).toBe(2);
    });

    it("leaves a genuine failure failing rather than masking it", () => {
        const reporter = new Wave4ExecutedCountReporter();

        reporter.onTestEnd(testCase("member is denied"), result("failed"));

        // A failed test still counts as executed: the run measured something and
        // that something was wrong. The guard must not convert this into its own
        // verdict, nor rescue it.
        expect(reporter.executedCount).toBe(1);
        expect(reporter.onEnd({ status: "failed" } as FullResult)).toBeUndefined();
    });
});
