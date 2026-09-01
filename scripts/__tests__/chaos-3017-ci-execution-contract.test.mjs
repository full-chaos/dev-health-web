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
const ASK_DEV_CONTRACTS_SCRIPT = path.join(ROOT, "scripts/ask-dev-contracts.mjs");

/**
 * The ops commit the Ask Dev contracts are pinned to, read from the sync
 * script that owns it rather than transcribed here. The quality job checks
 * out ops at this ref and then runs `ask-dev:contracts:check`, which refuses
 * any source whose HEAD is not exactly SOURCE_COMMIT — so a re-pin that
 * moved one and not the other would fail in CI only. Deriving it means the
 * workflow and the script cannot disagree in the first place.
 */
function pinnedOpsCommit() {
    const match = /^const SOURCE_COMMIT = "([0-9a-f]{40})";$/mu.exec(
        contents(ASK_DEV_CONTRACTS_SCRIPT),
    );
    if (!match) throw new Error("Could not read SOURCE_COMMIT from scripts/ask-dev-contracts.mjs.");
    return match[1];
}
const GENERAL_TIERS = [
    {
        commands: ["format:check:changed"],
        jobId: "format",
        packageScripts: { "format:check:changed": "node scripts/check-format-changed.mjs" },
        tier: "format",
    },
    {
        commands: [
            "audit --audit-level=high --prod",
            "codegen:check",
            `ask-dev:contracts:check --source ${path.join(ROOT, "dev-health-ops")}`,
            `ask-dev:contracts:check-currency --pinned ${path.join(ROOT, "dev-health-ops")} --current ${path.join(ROOT, "dev-health-ops-main")}`,
            `graphql:wire-parity:check --ops-root ${path.join(ROOT, "dev-health-ops-main")}`,
            "lint",
            "typecheck",
        ],
        jobId: "quality",
        packageScripts: {
            "codegen:check": "graphql-codegen --config codegen.ts --check",
            "ask-dev:contracts:check": "node scripts/ask-dev-contracts.mjs check",
            "ask-dev:contracts:check-currency": "node scripts/ask-dev-contracts.mjs check-currency",
            "graphql:wire-parity:check": "tsx scripts/graphql-wire-parity.ts check",
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
        commands: ["exec vitest run --coverage --coverage.reporter=text --coverage.reporter=lcov"],
        jobId: "unit",
        packageScripts: {},
        tier: "unit",
    },
];
const E2E_STAGES = ["e2e-default", "e2e-onboarding"];
// Route-stress suites and Context Fabric run inside the e2e-onboarding job
// (one runner, four sequential suites — GitHub concurrency limits).
const DEDICATED_E2E = [
    ["e2e-onboarding", "e2e-customer-push"],
    ["e2e-onboarding", "e2e-navigation"],
    ["e2e-onboarding", "e2e-onboarding"],
];
const E2E_HARNESS_CASES = [
    ...["1/3", "2/3", "3/3"].map((shard) => ({
        args: ["e2e-default", shard],
        expectedCommand: `test:e2e --shard ${shard}`,
        failScript: "test:e2e",
        name: `default shard ${shard}`,
    })),
    {
        args: ["e2e-customer-push"],
        expectedCommand: "test:e2e:customer-push",
        failScript: "test:e2e:customer-push",
        name: "customer push",
    },
    {
        args: ["e2e-navigation"],
        expectedCommand: "test:e2e:navigation",
        failScript: "test:e2e:navigation",
        name: "navigation",
    },
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
            if (jobId === "quality") {
                expect(workflowJob).toContain(
                    "        env:\n            ASK_DEV_OPS_ROOT: dev-health-ops\n" +
                        "            ASK_DEV_OPS_MAIN_ROOT: dev-health-ops-main",
                );
                expect(workflowJob).toContain("repository: full-chaos/dev-health-ops");
                expect(workflowJob).toContain(`ref: ${pinnedOpsCommit()}`);
                expect(workflowJob).toContain("path: dev-health-ops");
                // CHAOS-3511 currency guard: a SECOND, separate ops checkout
                // at main's current tip -- never the same path as the pinned
                // one, or the pinned checkout's exact-SHA requirement above
                // would be violated by whichever checkout runs second.
                expect(workflowJob).toContain("ref: main");
                expect(workflowJob).toContain("path: dev-health-ops-main");
            }
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
        expect(success.commands).toContain(
            "exec vitest run --coverage --coverage.reporter=text --coverage.reporter=lcov",
        );
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
        expect(scripts["test:e2e:customer-push"]).toBe(
            "playwright test -c playwright.customer-push.config.ts",
        );
        expect(scripts["test:e2e:navigation"]).toBe(
            "playwright test -c playwright.navigation.config.ts",
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

        // Context Fabric runs as the fourth step of the onboarding job.
        expect(
            runStep(job(workflow, "e2e-onboarding"), "bash ci/run_tests.sh e2e-context-fabric"),
        ).toBe("            - run: bash ci/run_tests.sh e2e-context-fabric");
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
