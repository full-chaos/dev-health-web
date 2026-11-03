import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CHAOS-11946: the live suite's report gate (CHAOS-12138). A skip is an environment fault and
 * fails, and a run of zero tests fails. Two outcomes are named, never counted as a pass, and do
 * not fail the run (lead's rulings on CHAOS-11946):
 *
 * - NOT RUN: a skipped case that carries a `NOT RUN` annotation (a view behind a flag that is off).
 * - KNOWN GAP: a case expected to fail (`test.fail`) that carries a `KNOWN GAP` annotation. If it
 *   starts to pass, Playwright marks it unexpected, and the gate fails so the case is flipped.
 *
 * An expected failure with no `KNOWN GAP` annotation fails the gate: it would otherwise read as a
 * pass with nothing to say why.
 */

const GATE = resolve(__dirname, "..", "live-e2e-skip-gate.mjs");

type Annotation = { type: string; description?: string };
type Case = {
    title: string;
    status: "expected" | "unexpected" | "flaky" | "skipped";
    expectedStatus?: "passed" | "failed" | "skipped";
    annotations?: Annotation[];
};

function gate(cases: Case[]): { code: number | null; out: string } {
    const dir = mkdtempSync(join(tmpdir(), "live-gate-"));
    const report = join(dir, "report.json");
    writeFileSync(
        report,
        JSON.stringify({
            suites: [
                {
                    title: "phase3.spec.ts",
                    specs: cases.map((item) => ({
                        title: item.title,
                        tests: [
                            {
                                status: item.status,
                                expectedStatus: item.expectedStatus ?? "passed",
                                annotations: item.annotations ?? [],
                            },
                        ],
                    })),
                },
            ],
        }),
    );
    const run = spawnSync(process.execPath, [GATE, report, "test"], {
        encoding: "utf8",
        env: { ...process.env, GITHUB_STEP_SUMMARY: "" },
    });
    return { code: run.status, out: `${run.stdout}${run.stderr}` };
}

const pass: Case = { title: "forecast 1", status: "expected" };
const notRun: Case = {
    title: "sankey",
    status: "skipped",
    expectedStatus: "skipped",
    annotations: [
        { type: "NOT RUN", description: "the sankey flag is off on this stack" },
        { type: "skip", description: "NOT RUN: the sankey flag is off" },
    ],
};
const knownGap: Case = {
    title: "quadrant 1 [KNOWN GAP CHAOS-12676]",
    status: "expected",
    expectedStatus: "failed",
    annotations: [
        { type: "KNOWN GAP", description: "CHAOS-12676: no two teams hold the same newest day" },
        { type: "fail", description: "KNOWN GAP CHAOS-12676" },
    ],
};

describe("live-e2e-skip-gate", () => {
    it("passes a run whose cases all passed", () => {
        const run = gate([pass]);
        expect(run.code).toBe(0);
        expect(run.out).toContain("passed 1 / failed 0 / skipped 0");
    });

    it("lists a NOT RUN case apart from the passes, and does not fail the run on it", () => {
        const run = gate([pass, notRun]);
        expect(run.code).toBe(0);
        expect(run.out).toContain(
            "passed 1 / failed 0 / skipped 0 / flaky 0 / not run 1 / known gap 0",
        );
        expect(run.out).toContain(
            "- NOT RUN: phase3.spec.ts > sankey -- the sankey flag is off on this stack",
        );
    });

    it("counts a failed case as failed even when it carries a NOT RUN note: only a skip is NOT RUN", () => {
        const run = gate([pass, { ...notRun, status: "unexpected", expectedStatus: "passed" }]);
        expect(run.out).toContain(
            "passed 1 / failed 1 / skipped 0 / flaky 0 / not run 0 / known gap 0",
        );
        expect(run.out).not.toContain("- NOT RUN:");
    });

    it("lists a KNOWN GAP apart from the passes: an expected failure is never counted as passed", () => {
        const run = gate([pass, knownGap]);
        expect(run.code).toBe(0);
        expect(run.out).toContain(
            "passed 1 / failed 0 / skipped 0 / flaky 0 / not run 0 / known gap 1",
        );
        expect(run.out).toContain(
            "- KNOWN GAP: phase3.spec.ts > quadrant 1 [KNOWN GAP CHAOS-12676] -- CHAOS-12676: no two teams hold the same newest day",
        );
    });

    it("counts a KNOWN GAP that started to pass as failed, not as a gap, so the case is flipped", () => {
        // Playwright marks it `unexpected` and exits non-zero (ci/run_tests.sh keeps that status).
        const run = gate([pass, { ...knownGap, status: "unexpected" }]);
        expect(run.out).toContain(
            "passed 1 / failed 1 / skipped 0 / flaky 0 / not run 0 / known gap 0",
        );
        expect(run.out).not.toContain("- KNOWN GAP:");
    });

    it("still fails a plain skip: a skip with no NOT RUN annotation is an environment fault", () => {
        const run = gate([pass, { title: "routed", status: "skipped", expectedStatus: "skipped" }]);
        expect(run.code).not.toBe(0);
        expect(run.out).toContain("- SKIPPED: phase3.spec.ts > routed");
    });

    it("fails an expected failure that names no KNOWN GAP: it would read as a pass with no reason", () => {
        const run = gate([
            pass,
            {
                title: "quadrant 1",
                status: "expected",
                expectedStatus: "failed",
                annotations: [{ type: "fail" }],
            },
        ]);
        expect(run.code).not.toBe(0);
        expect(run.out).toContain("names no KNOWN GAP");
    });

    it("fails a run where only NOT RUN and KNOWN GAP cases ran: nothing was measured", () => {
        const run = gate([notRun, knownGap]);
        expect(run.code).not.toBe(0);
        expect(run.out).toContain("no case passed");
    });
});
