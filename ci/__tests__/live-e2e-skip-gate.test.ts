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
    /** Each attempt's status; by default one attempt that matches `status`. */
    results?: string[];
};

const attemptsOf = (item: Case): string[] =>
    item.results ??
    (item.status === "skipped"
        ? ["skipped"]
        : item.status === "flaky"
          ? ["failed", "passed"]
          : item.status === "expected" && (item.expectedStatus ?? "passed") === "passed"
            ? ["passed"]
            : ["failed"]);

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
                                results: attemptsOf(item).map((status) => ({ status })),
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
    title: "sankey [behind a flag]",
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
            "- NOT RUN: phase3.spec.ts > sankey [behind a flag] -- the sankey flag is off on this stack",
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
        // Playwright marks it `unexpected`; the gate fails it too, with its own line.
        const run = gate([pass, { ...knownGap, status: "unexpected", results: ["passed"] }]);
        expect(run.out).toContain(
            "passed 1 / failed 1 / skipped 0 / flaky 0 / not run 0 / known gap 0",
        );
        expect(run.out).not.toContain("- KNOWN GAP:");
        expect(run.code).not.toBe(0);
        expect(run.out).toContain("- EXPECTED FAILURE THAT PASSED:");
    });

    // Codex r2 on #1801 (P2, executed): with retries, a KNOWN GAP case that passed on one attempt
    // and failed on another is `flaky`. It passed, so the gap no longer holds: it counts as failed.
    it("counts a KNOWN GAP that passed on any attempt as failed, even when Playwright calls it flaky", () => {
        const run = gate([pass, { ...knownGap, status: "flaky", results: ["passed", "failed"] }]);
        expect(run.code).not.toBe(0);
        expect(run.out).toContain(
            "passed 1 / failed 1 / skipped 0 / flaky 0 / not run 0 / known gap 0",
        );
        expect(run.out).toContain(
            "- EXPECTED FAILURE THAT PASSED: phase3.spec.ts > quadrant 1 [KNOWN GAP CHAOS-12676]",
        );
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
                title: "quadrant 1 [KNOWN GAP CHAOS-12676]",
                status: "expected",
                expectedStatus: "failed",
                annotations: [{ type: "fail" }],
            },
        ]);
        expect(run.code).not.toBe(0);
        expect(run.out).toContain("names no KNOWN GAP");
    });

    // Codex r1 on #1801 (P2, executed): Playwright copies describe- and file-level annotations onto
    // every case, so a NOT RUN or KNOWN GAP note alone can be inherited. Only the case's OWN skip or
    // fail reason makes it NOT RUN or a KNOWN GAP.
    it("does not excuse a skip whose own reason is not NOT RUN, even with an inherited NOT RUN note", () => {
        const run = gate([
            pass,
            {
                title: "flagged view > measures the backend response [behind a flag]",
                status: "skipped",
                expectedStatus: "failed",
                annotations: [
                    { type: "NOT RUN", description: "feature flag is off" },
                    { type: "fail" },
                    { type: "skip", description: "the backend is unreachable" },
                ],
            },
        ]);
        expect(run.code).not.toBe(0);
        expect(run.out).toContain(
            "- SKIPPED: phase3.spec.ts > flagged view > measures the backend response [behind a flag]",
        );
        const ownReason = gate([
            pass,
            {
                title: "flagged view [behind a flag]",
                status: "skipped",
                expectedStatus: "skipped",
                annotations: [
                    { type: "NOT RUN", description: "feature flag is off" },
                    { type: "skip", description: "the backend is unreachable" },
                ],
            },
        ]);
        expect(ownReason.code).not.toBe(0);
        expect(ownReason.out).toContain("- SKIPPED: phase3.spec.ts > flagged view [behind a flag]");
    });

    it("needs EVERY skip reason of the case to say NOT RUN: an inherited NOT RUN skip excuses no other", () => {
        const run = gate([
            pass,
            {
                title: "two reasons [behind a flag]",
                status: "skipped",
                expectedStatus: "skipped",
                annotations: [
                    { type: "NOT RUN", description: "feature flag is off" },
                    { type: "skip", description: "NOT RUN: inherited from the describe block" },
                    { type: "skip", description: "the backend is unreachable" },
                ],
            },
        ]);
        expect(run.code).not.toBe(0);
        expect(run.out).toContain("- SKIPPED: phase3.spec.ts > two reasons [behind a flag]");
    });

    it("takes NOT RUN only from a case expected to skip, never from a skipped test.fail case", () => {
        const run = gate([
            pass,
            {
                title: "fail then skip [behind a flag]",
                status: "skipped",
                expectedStatus: "failed",
                annotations: [
                    { type: "NOT RUN", description: "feature flag is off" },
                    { type: "fail", description: "KNOWN GAP: something" },
                    { type: "skip", description: "NOT RUN: the flag is off" },
                ],
            },
        ]);
        expect(run.code).not.toBe(0);
        expect(run.out).toContain("- SKIPPED: phase3.spec.ts > fail then skip [behind a flag]");
    });

    it("does not excuse an expected failure whose own reason is not KNOWN GAP, even with an inherited note", () => {
        const run = gate([
            pass,
            {
                title: "quadrant 1 [KNOWN GAP CHAOS-12676]",
                status: "expected",
                expectedStatus: "failed",
                annotations: [
                    { type: "KNOWN GAP", description: "inherited from the describe block" },
                    { type: "fail", description: "this case is broken" },
                ],
            },
        ]);
        expect(run.code).not.toBe(0);
        expect(run.out).toContain("names no KNOWN GAP");
    });

    // Codex r1 on #1801 (P2, executed): with retries, a case can fail and then skip; Playwright
    // calls it flaky. No attempt passed, so it is a skip, never evidence that a case passed.
    it("counts a flaky case whose last attempt skipped as a skip, not as a pass", () => {
        const flakySkip: Case = {
            title: "retried",
            status: "flaky",
            expectedStatus: "skipped",
            results: ["failed", "skipped"],
            annotations: [{ type: "skip", description: "the backend is unreachable" }],
        };
        const alone = gate([flakySkip]);
        expect(alone.code).not.toBe(0);
        expect(alone.out).toContain("passed 0 / failed 0 / skipped 1 / flaky 0");
        const beside = gate([pass, flakySkip]);
        expect(beside.code).not.toBe(0);
        expect(beside.out).toContain("- SKIPPED: phase3.spec.ts > retried");
    });

    it("takes a flaky case with a passing attempt as evidence that a case passed", () => {
        const run = gate([{ title: "retried", status: "flaky" }]);
        expect(run.code).toBe(0);
        expect(run.out).toContain("passed 0 / failed 0 / skipped 0 / flaky 1");
    });

    // Codex r3 on #1801 (P2, executed): annotations are inherited, so neither a NOT RUN nor a
    // KNOWN GAP may rest on annotations alone. The case's OWN title must carry the marker, and a
    // title is never inherited from a describe block.
    it("does not take a KNOWN GAP from inherited annotations: the case's own title must say it", () => {
        const run = gate([
            pass,
            {
                title: "unrelated failing case inside annotated describe",
                status: "expected",
                expectedStatus: "failed",
                annotations: [
                    { type: "KNOWN GAP", description: "inherited group label" },
                    { type: "fail", description: "KNOWN GAP: inherited group label" },
                ],
            },
        ]);
        expect(run.code).not.toBe(0);
        expect(run.out).toContain(
            "- EXPECTED FAILURE WITH NO KNOWN GAP: phase3.spec.ts > unrelated failing case inside annotated describe",
        );
    });

    it("does not take a NOT RUN from inherited annotations: the case's own title must say it", () => {
        const run = gate([pass, { ...notRun, title: "sankey" }]);
        expect(run.code).not.toBe(0);
        expect(run.out).toContain("- SKIPPED: phase3.spec.ts > sankey");
    });

    it("accepts a runtime test.fail reason alone, with the marker in the case's own title", () => {
        const run = gate([
            pass,
            {
                title: "quadrant 2 [KNOWN GAP CHAOS-12676]",
                status: "expected",
                expectedStatus: "failed",
                annotations: [
                    { type: "fail", description: "KNOWN GAP CHAOS-12676: no quadrant served" },
                ],
            },
        ]);
        expect(run.code).toBe(0);
        expect(run.out).toContain(
            "- KNOWN GAP: phase3.spec.ts > quadrant 2 [KNOWN GAP CHAOS-12676] -- KNOWN GAP CHAOS-12676: no quadrant served",
        );
    });

    it("fails a run where only NOT RUN and KNOWN GAP cases ran: nothing was measured", () => {
        const run = gate([notRun, knownGap]);
        expect(run.code).not.toBe(0);
        expect(run.out).toContain("no case passed");
    });
});
