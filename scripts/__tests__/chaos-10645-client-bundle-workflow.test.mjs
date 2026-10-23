import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    ROOT,
    contents,
    job,
    recordHarnessPackageCommands,
    runStep,
    step,
    stepRun,
} from "./chaos-3017-ci-contract-helpers.mjs";

const WORKFLOW = path.join(ROOT, ".github/workflows/tests.yml");
const RUN_TESTS = path.join(ROOT, "ci/run_tests.sh");
const SECRET_NAMES = [
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "AUTH_GITHUB_SECRET",
    "AUTH_GOOGLE_SECRET",
    "AUTH_GITLAB_SECRET",
    "LINEAR_API_KEY",
];

describe("the client bundle scan in the hosted workflow", () => {
    it("runs in the build job, which is required, not optional and not skipped on code changes", () => {
        const build = job(contents(WORKFLOW), "build");

        expect(build).not.toContain("continue-on-error:");
        expect(build).toMatch(/^        if: needs\.changes\.outputs\.code == 'true'$/mu);
        expect(runStep(build, "bash ci/run_tests.sh build")).toBe(
            "            - run: bash ci/run_tests.sh build",
        );
    });

    it("is not a step the build job can skip or replace: no other step runs the scan", () => {
        const workflow = contents(WORKFLOW);

        expect(workflow).not.toContain("check:client-bundle");
        expect(workflow).not.toContain("check-client-bundle");
    });

    it("blocks the aggregate check when the build job is not green", () => {
        const aggregator = job(contents(WORKFLOW), "test");

        expect(aggregator).toMatch(/^        needs: \[[^\]]*\bbuild\b[^\]]*\]$/mu);
        expect(aggregator).toMatch(/^        if: always\(\)$/mu);
        const script = stepRun(aggregator, "Check general test stages");
        expect(script).toContain(`"\${{ needs.build.result }}" != 'success'`);
        expect(step(aggregator, "Check general test stages")).not.toContain("continue-on-error:");
    });

    it("moves with the files that change what the scan reads", () => {
        const workflow = contents(WORKFLOW);
        const filter = workflow.slice(workflow.indexOf("filters: |"));

        for (const pattern of ["'src/**'", "'scripts/**'", "'ci/**'", "'next.config.*'"]) {
            expect(filter, pattern).toContain(pattern);
        }
    });
});

describe("the client bundle scan in the test harness", () => {
    it("is the step right after the build, in the same subshell, with --require-secrets", () => {
        const source = contents(RUN_TESTS);
        const start = source.indexOf("run_build() {");
        const end = source.indexOf("\n}\n", start);
        const body = source.slice(start, end);

        const build = body.indexOf("run_pnpm_script build");
        const scan = body.indexOf("pnpm check:client-bundle --require-secrets");
        expect(build).toBeGreaterThan(0);
        expect(scan).toBeGreaterThan(build);
        expect(body.slice(build + "run_pnpm_script build".length, scan)).not.toMatch(/\|\|/u);
        expect(body.trimStart().startsWith("run_build() {\n  (")).toBe(true);
        expect(body.trimEnd().endsWith(")")).toBe(true);
        expect(source).toMatch(/^set -euo pipefail$/mu);
    });

    it("gives every secret variable a placeholder value for the build and the scan only", () => {
        const source = contents(RUN_TESTS);
        const line = source.match(/^\s+for name in ([A-Z_ ]+); do$/mu);

        expect(line).not.toBeNull();
        expect(line[1].split(" ")).toEqual(SECRET_NAMES);
    });

    it("runs the build tier as build, then the scan, and nothing else", () => {
        const run = recordHarnessPackageCommands(["build"]);

        expect(run.result.status).toBe(0);
        expect(run.commands).toEqual(["build", "check:client-bundle --require-secrets"]);
    });

    it("fails the build tier when the scan fails, and does not run the scan after a failed build", () => {
        const scanRed = recordHarnessPackageCommands(["build"], {
            failScript: "check:client-bundle",
        });
        const buildRed = recordHarnessPackageCommands(["build"], { failScript: "build" });

        expect(scanRed.result.status).toBe(42);
        expect(buildRed.result.status).toBe(42);
        expect(buildRed.commands).toEqual(["build"]);
    });

    it("runs the scan in the aggregate tier too, with the same arguments", () => {
        const run = recordHarnessPackageCommands(["ci"]);

        expect(run.commands).toContain("check:client-bundle --require-secrets");
        const red = recordHarnessPackageCommands(["ci"], { failScript: "check:client-bundle" });
        expect(red.result.status).toBe(42);
    });

    it("has a package script that runs the scan file and that file exists", () => {
        const scripts = JSON.parse(contents(path.join(ROOT, "package.json"))).scripts;

        expect(scripts["check:client-bundle"]).toBe("node scripts/check-client-bundle.mjs");
        expect(fs.existsSync(path.join(ROOT, "scripts/check-client-bundle.mjs"))).toBe(true);
    });
});
