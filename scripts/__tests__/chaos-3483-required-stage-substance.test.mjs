// CHAOS-3483: no stage inside the REQUIRED `test` gate may pass while doing
// nothing.
//
// The `integration` stage did exactly that from the day the tiered test
// contract landed (2026-02-19) until this file did. `test:integration` was
// `node -e "console.log('Integration tests are not implemented yet
// (placeholder).')"`, wired into the `integration` job, wired into the `test`
// aggregator's `needs`, and `test` is the required status check on this
// repository. It was honestly named -- and that is exactly why it survived:
// in the gate's output a placeholder that exits 0 and a real suite that exits
// 0 are the same green tick, so nobody was ever prompted to implement or
// remove it. The stage is gone now, and this test is what keeps it gone.
//
// It does not hard-code "integration". It walks the aggregator's real `needs`
// list, executes each stage's `ci/run_tests.sh` invocation through the
// recording harness (which shims pnpm/npx, so nothing real runs), and asserts
// every command that reaches a package script resolves to something that
// actually invokes a test runner. A future stage wired to `echo TODO` fails
// here, whatever it is called.
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    ROOT,
    contents,
    job,
    recordHarnessPackageCommands,
} from "./chaos-3017-ci-contract-helpers.mjs";

const TESTS_WORKFLOW = path.join(ROOT, ".github/workflows/tests.yml");
const PACKAGE_JSON = path.join(ROOT, "package.json");

// Shapes that print or shrug rather than test. `node -e` is here because it is
// what the removed placeholder used; `echo`/`true`/`:` because they are what a
// hurried replacement would use next.
const INERT_COMMAND = /^\s*(echo\b|:\s*$|true\s*$|node\s+-e\b|printf\b)/u;
const INERT_WORDS = /placeholder|not implemented|no-op|todo/iu;

/**
 * @param {string} body a package.json script body
 * @returns {string[]} the reasons this body does no testing work, if any
 */
export function inertReasons(body) {
    const reasons = [];
    if (INERT_COMMAND.test(body)) {
        reasons.push(`runs an inert command: ${body}`);
    }
    if (INERT_WORDS.test(body)) {
        reasons.push(`declares itself unimplemented: ${body}`);
    }
    return reasons;
}

function aggregatorStages() {
    const aggregator = job(contents(TESTS_WORKFLOW), "test");
    const match = aggregator.match(/^\s+needs: \[([^\]]+)\]$/mu);
    expect(match, "the test aggregator declares no needs").not.toBeNull();
    const stages = match[1].split(",").map((value) => value.trim());
    // `changes` is the selector, not a stage that runs work.
    return stages.filter((stage) => stage !== "changes");
}

function harnessInvocations(stageJob) {
    const invocations = [];
    for (const line of stageJob.split(/\r?\n/u)) {
        const match = line.match(/- run: bash ci\/run_tests\.sh (.+)$/u);
        if (match) {
            invocations.push(
                match[1]
                    // The shard matrix expands at run time; one shard is enough
                    // to reach the package script the tier executes.
                    .replace(/\$\{\{\s*matrix\.shard\s*\}\}/gu, "1")
                    .trim()
                    .split(/\s+/u),
            );
        }
    }
    return invocations;
}

describe("CHAOS-3483 required stages do substantive work", () => {
    const workflow = contents(TESTS_WORKFLOW);
    const scripts = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8")).scripts;
    const stages = aggregatorStages();

    it("finds stages to judge", () => {
        // A gate given nothing to judge must not report success -- if this
        // parse ever returns an empty list, every assertion below would pass
        // vacuously and this file would read as coverage while checking
        // nothing.
        expect(stages.length).toBeGreaterThan(0);
    });

    it("no longer carries the integration placeholder", () => {
        expect(stages).not.toContain("integration");
        expect(scripts).not.toHaveProperty("test:integration");
        expect(contents(path.join(ROOT, "ci/run_tests.sh"))).not.toContain("test:integration");
    });

    it.each(aggregatorStages())("stage %s executes a real suite", (stage) => {
        const stageJob = job(workflow, stage);
        const invocations = harnessInvocations(stageJob);
        expect(invocations.length, `${stage} never invokes ci/run_tests.sh`).toBeGreaterThan(0);

        for (const args of invocations) {
            const { commands, result } = recordHarnessPackageCommands(args);
            expect(result.error, `${stage}: ${args.join(" ")}`).toBeUndefined();
            expect(
                commands.filter(Boolean).length,
                `${stage} tier ${args.join(" ")} issued no commands at all`,
            ).toBeGreaterThan(0);

            for (const command of commands) {
                const name = command.split(" ", 1)[0];
                const body = scripts[name];
                // A command that is not a package script name is a direct
                // runner invocation (`exec vitest ...`, `audit ...`) -- the
                // program IS the work, so judge the command text itself.
                const reasons = inertReasons(body ?? command);
                expect(
                    reasons,
                    `${stage} tier ${args.join(" ")} runs '${command}', which does no testing work`,
                ).toEqual([]);
            }
        }
    });
});

describe("CHAOS-3483 the inertness predicate itself", () => {
    // The check above is only as good as this predicate, and a predicate that
    // rejects nothing would let every stage pass. These are the old
    // placeholder's exact body and the shapes a replacement would take,
    // against the real script bodies this repository actually ships.
    it.each([
        "node -e \"console.log('Integration tests are not implemented yet (placeholder).')\"",
        "echo 'TODO: integration tests'",
        "true",
        ":",
        "node scripts/thing.mjs # placeholder until CHAOS-9999",
    ])("rejects %s", (body) => {
        expect(inertReasons(body)).not.toEqual([]);
    });

    it.each([
        "vitest run",
        "playwright test --project=authenticated",
        "next build",
        "tsc --noEmit",
        "node scripts/check-format-changed.mjs",
    ])("accepts %s", (body) => {
        expect(inertReasons(body)).toEqual([]);
    });
});
