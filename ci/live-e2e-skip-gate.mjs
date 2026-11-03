// CHAOS-12138 / AGENTS.md verification rule 4: a measurement that did not happen must FAIL.
// Reads the Playwright JSON report, prints the counts (and to the job summary), and exits
// non-zero when any test was skipped, when no test ran, or when the report is missing.
//
// CHAOS-11946 (lead's rulings): two outcomes are listed on their own, never counted as a pass,
// and do not fail the run. NOT RUN is a skipped case with a `NOT RUN` annotation (a view behind a
// flag that is off). KNOWN GAP is a case expected to fail (`test.fail`) with a `KNOWN GAP`
// annotation; if it starts to pass, Playwright marks it unexpected and it counts as failed. An
// expected failure with no `KNOWN GAP` annotation fails the run, and so does a run where no case
// passed.
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const [reportPath, label = "live-e2e"] = process.argv.slice(2);
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

function out(line) {
    console.log(line);
    if (summaryPath) appendFileSync(summaryPath, `${line}\n`);
}

if (!reportPath || !existsSync(reportPath)) {
    out(`### live-e2e (${label}): no report at ${reportPath}`);
    console.error("::error::live-e2e produced no JSON report; the measurement did not happen.");
    process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const counts = { passed: 0, failed: 0, skipped: 0, flaky: 0, notRun: 0, knownGap: 0 };
const skipped = [];
const notRun = [];
const knownGaps = [];
const unexplained = [];
const noteOf = (t, type) => (t.annotations ?? []).find((a) => a.type === type);
// A NOT RUN or KNOWN GAP note can be inherited from a describe block or the file (Playwright copies
// those onto every case), so the note alone excuses nothing. The case's OWN reason does: every
// `skip` (or `fail`) annotation it carries must state the marker, and it must carry one.
const ownReasonsSay = (t, type, marker) => {
    const reasons = (t.annotations ?? []).filter((a) => a.type === type);
    return (
        reasons.length > 0 &&
        reasons.every((a) => typeof a.description === "string" && a.description.startsWith(marker))
    );
};
// A pass is an attempt that passed a case expected to pass; a flaky case counts only through one.
const passedAttempt = (t) =>
    t.expectedStatus === "passed" && (t.results ?? []).some((r) => r.status === "passed");
let passedEvidence = 0;

function walk(suite, trail) {
    const here = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
            const status = t.status; // expected | unexpected | flaky | skipped
            const name = [...here, spec.title].join(" > ");
            const notRunNote = noteOf(t, "NOT RUN");
            const gapNote = noteOf(t, "KNOWN GAP");
            const skippedCase =
                status === "skipped" || (status === "flaky" && t.expectedStatus === "skipped");
            if (
                skippedCase &&
                t.expectedStatus === "skipped" &&
                notRunNote !== undefined &&
                ownReasonsSay(t, "skip", "NOT RUN")
            ) {
                counts.notRun++;
                notRun.push(
                    `${name}${notRunNote.description ? ` -- ${notRunNote.description}` : ""}`,
                );
            } else if (status === "expected" && t.expectedStatus === "failed") {
                if (gapNote === undefined || !ownReasonsSay(t, "fail", "KNOWN GAP")) {
                    counts.failed++;
                    unexplained.push(name);
                } else {
                    counts.knownGap++;
                    knownGaps.push(
                        `${name}${gapNote.description ? ` -- ${gapNote.description}` : ""}`,
                    );
                }
            } else if (skippedCase) {
                counts.skipped++;
                const reason =
                    (t.annotations ?? []).find((a) => a.type === "skip")?.description ?? "";
                skipped.push(
                    `${[...here, spec.title].join(" > ")}${reason ? ` -- ${reason}` : ""}`,
                );
            } else if (status === "expected") counts.passed++;
            else if (status === "flaky") counts.flaky++;
            else counts.failed++;
            if (!skippedCase && passedAttempt(t)) passedEvidence++;
        }
    }
    for (const child of suite.suites ?? []) walk(child, here);
}
for (const suite of report.suites ?? []) walk(suite, []);

const total =
    counts.passed + counts.failed + counts.skipped + counts.flaky + counts.notRun + counts.knownGap;
out(`### live-e2e (${label})`);
out(
    `passed ${counts.passed} / failed ${counts.failed} / skipped ${counts.skipped} / flaky ${counts.flaky} / not run ${counts.notRun} / known gap ${counts.knownGap} (total ${total})`,
);
for (const s of skipped) out(`- SKIPPED: ${s}`);
for (const s of notRun) out(`- NOT RUN: ${s}`);
for (const s of knownGaps) out(`- KNOWN GAP: ${s}`);
for (const s of unexplained) out(`- EXPECTED FAILURE WITH NO KNOWN GAP: ${s}`);

if (total === 0) {
    console.error("::error::live-e2e ran zero tests; the measurement did not happen.");
    process.exit(1);
}
if (unexplained.length > 0) {
    console.error(
        `::error::live-e2e (${label}): ${unexplained.length} expected failure(s) names no KNOWN GAP; it would read as a pass with no reason.`,
    );
    process.exit(1);
}
if (passedEvidence === 0) {
    console.error(
        `::error::live-e2e (${label}): no case passed; NOT RUN and KNOWN GAP cases measure nothing.`,
    );
    process.exit(1);
}
if (counts.skipped > 0) {
    console.error(
        `::error::live-e2e (${label}) skipped ${counts.skipped} test(s). A skip is an environment fault, not a pass.`,
    );
    process.exit(1);
}
