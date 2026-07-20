import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    ROOT,
    contents,
    executeWorkflowRun,
    expectSuccessfulProcess,
    job,
    matrixShardLabels,
    recordHarnessPackageCommands,
    runStep,
    step,
    stepRun,
} from "./chaos-3017-ci-contract-helpers.mjs";

const TESTS_WORKFLOW = path.join(ROOT, ".github/workflows/tests.yml");
const PACKAGE_JSON = path.join(ROOT, "package.json");
const GENERAL_TIERS = [
    {
        commands: ["format:check:changed"],
        jobId: "format",
        packageScripts: { "format:check:changed": "node scripts/check-format-changed.mjs" },
        tier: "format",
    },
    {
        commands: ["audit --audit-level=high --prod", "codegen:check", "lint", "typecheck"],
        jobId: "quality",
        packageScripts: {
            "codegen:check": "graphql-codegen --config codegen.ts --check",
            lint: "eslint src",
            typecheck: "tsc --noEmit",
        },
        tier: "quality",
    },
    {
        commands: ["build"],
        jobId: "build",
        packageScripts: { build: "next build" },
        tier: "build",
    },
    {
        commands: ["exec vitest run"],
        jobId: "unit",
        packageScripts: {},
        tier: "unit",
    },
    {
        commands: ["test:integration"],
        jobId: "integration",
        packageScripts: {
            "test:integration":
                "node -e \"console.log('Integration tests are not implemented yet (placeholder).')\"",
        },
        tier: "integration",
    },
];
const E2E_STAGES = ["e2e-default", "e2e-onboarding", "e2e-context-fabric"];
const DEDICATED_E2E = [
    ["e2e-onboarding", "e2e-onboarding"],
    ["e2e-context-fabric", "e2e-context-fabric"],
];
const E2E_HARNESS_CASES = [
    ...["1/3", "2/3", "3/3"].map((shard) => ({
        args: ["e2e-default", shard],
        expectedCommand: `test:e2e --shard ${shard}`,
        failScript: "test:e2e",
        name: `default shard ${shard}`,
    })),
    {
        args: ["e2e-onboarding"],
        expectedCommand: "test:e2e:onboarding",
        failScript: "test:e2e:onboarding",
        name: "onboarding",
    },
    {
        args: ["e2e-context-fabric"],
        expectedCommand: "test:e2e:context-fabric",
        failScript: "test:e2e:context-fabric",
        name: "Context Fabric",
    },
    {
        args: ["pagerduty-final-qa"],
        expectedCommand: "test:e2e:pagerduty-final-qa",
        failScript: "test:e2e:pagerduty-final-qa",
        name: "PagerDuty final QA",
    },
];

describe("CHAOS-3017 executable CI boundaries", () => {
    it("fails closed when change detection fails", () => {
        const aggregator = job(contents(TESTS_WORKFLOW), "test");

        expect(step(aggregator, "Check change detection")).toBe(
            [
                "            - name: Check change detection",
                "              if: needs.changes.result != 'success'",
                "              run: exit 1",
            ].join("\n"),
        );
    });

    it("accepts only skipped E2E jobs when the E2E filter is disabled", () => {
        const aggregator = job(contents(TESTS_WORKFLOW), "test");
        const skippedStep = step(aggregator, "Check E2E test stages were skipped");
        expect(skippedStep).toMatch(
            /^              if: needs\.changes\.result == 'success' && needs\.changes\.outputs\.code == 'true' && needs\.changes\.outputs\.e2e != 'true'$/mu,
        );
        expect(skippedStep).not.toContain("continue-on-error:");

        const script = stepRun(aggregator, "Check E2E test stages were skipped");
        const skipped = Object.fromEntries(E2E_STAGES.map((stage) => [stage, "skipped"]));
        expectSuccessfulProcess(executeWorkflowRun(script, skipped));
        for (const stage of E2E_STAGES) {
            for (const result of ["success", "failure", "cancelled"]) {
                const failed = executeWorkflowRun(script, { ...skipped, [stage]: result });
                expect(failed.status, `${stage}=${result}`).not.toBe(0);
            }
        }
    });

    it.each(GENERAL_TIERS)(
        "keeps the $jobId job and harness fail closed",
        ({ commands, jobId, packageScripts, tier }) => {
            const workflowJob = job(contents(TESTS_WORKFLOW), jobId);
            const workflowCommand = `bash ci/run_tests.sh ${tier}`;
            const scripts = JSON.parse(contents(PACKAGE_JSON)).scripts;
            expect(workflowJob).not.toContain("continue-on-error:");
            expect(workflowJob).toMatch(/^        if: needs\.changes\.outputs\.code == 'true'$/mu);
            expect(runStep(workflowJob, workflowCommand)).toBe(
                `            - run: ${workflowCommand}`,
            );
            for (const [name, implementation] of Object.entries(packageScripts)) {
                expect(scripts[name]).toBe(implementation);
            }

            const success = recordHarnessPackageCommands([tier]);
            expectSuccessfulProcess(success.result);
            expect(success.commands).toEqual(commands);
            for (const command of commands) {
                const failScript = command.split(" ", 1)[0];
                const failed = recordHarnessPackageCommands([tier], { failScript });
                expect(failed.result.status, `${tier}: ${failScript}`).toBe(42);
            }
        },
    );

    it("keeps aggregate CI unit execution independent of the test:unit alias", () => {
        const scripts = JSON.parse(contents(PACKAGE_JSON)).scripts;
        expect(scripts["test:ci"]).toBe("bash ci/run_tests.sh ci");

        const success = recordHarnessPackageCommands(["ci"]);
        expectSuccessfulProcess(success.result);
        expect(success.commands).toContain("exec vitest run");
        expect(success.commands).not.toContain("test:unit");

        const failed = recordHarnessPackageCommands(["ci"], { failScript: "exec" });
        expect(failed.result.status).toBe(42);
    });

    it("binds every E2E job and harness path to its real package script", () => {
        const workflow = contents(TESTS_WORKFLOW);
        const scripts = JSON.parse(contents(PACKAGE_JSON)).scripts;
        expect(scripts["test:e2e"]).toBe(
            "playwright test --project=authenticated --project=unauthenticated",
        );
        expect(scripts["test:e2e:onboarding"]).toBe(
            "playwright test -c playwright.onboarding.config.ts",
        );
        expect(scripts["test:e2e:context-fabric"]).toBe("node scripts/context-fabric-qa.mjs");

        const defaultJob = job(workflow, "e2e-default");
        const defaultCommand = "bash ci/run_tests.sh e2e-default ${{ matrix.shard }}/3";
        expect(defaultJob).not.toContain("continue-on-error:");
        expect(runStep(defaultJob, defaultCommand)).toBe(`            - run: ${defaultCommand}`);
        expect(matrixShardLabels(defaultJob)).toEqual(["1/3", "2/3", "3/3"]);

        for (const [jobId, tier] of DEDICATED_E2E) {
            const workflowCommand = `bash ci/run_tests.sh ${tier}`;
            const workflowJob = job(workflow, jobId);
            expect(workflowJob).not.toContain("continue-on-error:");
            expect(workflowJob).toMatch(/^        if: needs\.changes\.outputs\.e2e == 'true'$/mu);
            expect(runStep(workflowJob, workflowCommand)).toBe(
                `            - run: ${workflowCommand}`,
            );
        }

        const pagerDutyJob = job(workflow, "pagerduty-final-qa");
        expect(pagerDutyJob).toMatch(/^        if: needs\.changes\.outputs\.code == 'true'$/mu);
        expect(runStep(pagerDutyJob, "bash ci/run_tests.sh pagerduty-final-qa")).toBe(
            "            - run: bash ci/run_tests.sh pagerduty-final-qa",
        );
    });

    it.each(E2E_HARNESS_CASES)(
        "executes $name through the harness and propagates package failures",
        ({ args, expectedCommand, failScript }) => {
            const success = recordHarnessPackageCommands(args);
            expectSuccessfulProcess(success.result);
            expect(success.commands).toContain(expectedCommand);
            const failed = recordHarnessPackageCommands(args, { failScript });
            expect(failed.result.status).toBe(42);
        },
    );
});
