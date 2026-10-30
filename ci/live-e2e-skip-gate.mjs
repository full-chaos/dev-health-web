// CHAOS-12138 / AGENTS.md verification rule 4: a measurement that did not happen must FAIL.
// Reads the Playwright JSON report, prints the counts (and to the job summary), and exits
// non-zero when any test was skipped, when no test ran, or when the report is missing.
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
const counts = { passed: 0, failed: 0, skipped: 0, flaky: 0 };
const skipped = [];

function walk(suite, trail) {
    const here = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
            const status = t.status; // expected | unexpected | flaky | skipped
            if (status === "skipped") {
                counts.skipped++;
                const reason =
                    (t.annotations ?? []).find((a) => a.type === "skip")?.description ?? "";
                skipped.push(
                    `${[...here, spec.title].join(" > ")}${reason ? ` -- ${reason}` : ""}`,
                );
            } else if (status === "expected") counts.passed++;
            else if (status === "flaky") counts.flaky++;
            else counts.failed++;
        }
    }
    for (const child of suite.suites ?? []) walk(child, here);
}
for (const suite of report.suites ?? []) walk(suite, []);

const total = counts.passed + counts.failed + counts.skipped + counts.flaky;
out(`### live-e2e (${label})`);
out(
    `passed ${counts.passed} / failed ${counts.failed} / skipped ${counts.skipped} / flaky ${counts.flaky} (total ${total})`,
);
for (const s of skipped) out(`- SKIPPED: ${s}`);

if (total === 0) {
    console.error("::error::live-e2e ran zero tests; the measurement did not happen.");
    process.exit(1);
}
if (counts.skipped > 0) {
    console.error(
        `::error::live-e2e (${label}) skipped ${counts.skipped} test(s). A skip is an environment fault, not a pass.`,
    );
    process.exit(1);
}
