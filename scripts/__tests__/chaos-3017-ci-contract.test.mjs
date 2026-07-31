import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    ROOT,
    NON_SUCCESS_RESULTS,
    REQUIRED_STAGE_GROUPS,
    contents,
    executeWorkflowRun,
    expectSuccessfulProcess,
    intersection,
    job,
    listDefaultPlaywrightTests,
    matrixShardLabels,
    normalizePlaywrightTestIdentity,
    runHarness,
    step,
    stepRun,
} from "./chaos-3017-ci-contract-helpers.mjs";

const TESTS_WORKFLOW = path.join(ROOT, ".github/workflows/tests.yml");
const STATIC_WORKFLOW = path.join(ROOT, ".github/workflows/build-static.yml");
const BUILD_WORKFLOW = path.join(ROOT, ".github/workflows/build.yml");
const DOCKER_WORKFLOW = path.join(ROOT, ".github/workflows/build-docker.yml");
const LIVE_E2E_WORKFLOW = path.join(ROOT, ".github/workflows/live-e2e.yml");
const HARNESS = path.join(ROOT, "ci/run_tests.sh");
const DEFAULT_PLAYWRIGHT_CONFIG = path.join(ROOT, "playwright.config.ts");

describe("CHAOS-3017 CI contracts", () => {
    it("preserves the required Build Static Assets and test check names", () => {
        expect(contents(STATIC_WORKFLOW)).toMatch(/^name: Build Static Assets$/m);
        expect(job(contents(TESTS_WORKFLOW), "test")).toMatch(/^        name: test$/m);
    });

    it("makes the test aggregator fail closed on its explicit required stages", () => {
        const aggregator = job(contents(TESTS_WORKFLOW), "test");

        expect(aggregator).toMatch(
            /needs: \[changes, format, quality, build, unit, integration, e2e-default, e2e-onboarding, e2e-context-fabric, pagerduty-final-qa\]/,
        );
        expect(aggregator).toMatch(/^        if: always\(\)$/mu);
        expect(aggregator).not.toContain("toJson(needs)");
        expect(aggregator).not.toContain("continue-on-error:");
        expect(step(aggregator, "Check general test stages")).toMatch(
            /^              if: needs\.changes\.result == 'success' && needs\.changes\.outputs\.code == 'true'$/mu,
        );
        expect(step(aggregator, "Check E2E test stages")).toMatch(
            /^              if: needs\.changes\.result == 'success' && needs\.changes\.outputs\.e2e == 'true'$/mu,
        );
    });

    it.each(REQUIRED_STAGE_GROUPS)(
        "executes the %s aggregator check and rejects every non-success result",
        (_, stepName, stages) => {
            const script = stepRun(job(contents(TESTS_WORKFLOW), "test"), stepName);
            const successResults = Object.fromEntries(stages.map((stage) => [stage, "success"]));
            const success = executeWorkflowRun(script, successResults);

            expectSuccessfulProcess(success);

            for (const stage of stages) {
                for (const result of NON_SUCCESS_RESULTS) {
                    const failed = executeWorkflowRun(script, {
                        ...successResults,
                        [stage]: result,
                    });
                    expect(failed.error).toBeUndefined();
                    expect(failed.signal).toBeNull();
                    expect(failed.status, `${stage}=${result}`).not.toBeNull();
                    expect(failed.status, `${stage}=${result}`).not.toBe(0);
                }
            }
        },
    );

    it("fans default E2E into three independent shards and dedicated suites", () => {
        const workflow = contents(TESTS_WORKFLOW);
        const defaultE2e = job(workflow, "e2e-default");

        expect(defaultE2e).toMatch(/fail-fast: false/);
        expect(matrixShardLabels(defaultE2e)).toEqual(["1/3", "2/3", "3/3"]);
        expect(defaultE2e).not.toMatch(/^\s+(?:exclude|include):/mu);
        expect(defaultE2e).toMatch(/^        if: needs\.changes\.outputs\.e2e == 'true'$/mu);
        expect(defaultE2e).toMatch(
            /^            - run: bash ci\/run_tests\.sh e2e-default \$\{\{ matrix\.shard \}\}\/3$/mu,
        );
        expect(job(workflow, "e2e-onboarding")).toMatch(
            /^            - run: bash ci\/run_tests\.sh e2e-onboarding$/mu,
        );
        expect(job(workflow, "e2e-context-fabric")).toMatch(
            /^            - run: bash ci\/run_tests\.sh e2e-context-fabric$/mu,
        );
    });

    it("compares Playwright tests by stable identity instead of source coordinates", () => {
        const original =
            "[authenticated] › app-shell.spec.ts:3:5 › app shell renders chart sections";
        const shifted =
            "[authenticated] › app-shell.spec.ts:40:16 › app shell renders chart sections";

        expect(normalizePlaywrightTestIdentity(original)).toBe(
            normalizePlaywrightTestIdentity(shifted),
        );
    });

    it("keeps default E2E shards non-empty, exhaustive, and disjoint outside setup dependencies", async () => {
        const shardLabels = matrixShardLabels(job(contents(TESTS_WORKFLOW), "e2e-default"));
        // Each Playwright process uses the report and result paths from the shared
        // config. Listing them concurrently makes those processes race while the
        // broader Vitest suite is also active, producing incomplete inventories.
        const full = await listDefaultPlaywrightTests();
        const shards = [];
        for (const shard of shardLabels) {
            shards.push(await listDefaultPlaywrightTests(shard));
        }

        expect(full.length).toBeGreaterThan(0);
        expect(new Set(full).size).toBe(full.length);
        for (const shard of shards) {
            expect(shard.length).toBeGreaterThan(0);
            expect(new Set(shard).size).toBe(shard.length);
        }

        const setup = full.filter((entry) => entry.startsWith("[auth-setup] › "));
        const setupSet = new Set(setup);
        expect(setup.length).toBeGreaterThan(0);
        for (const shard of shards) {
            expect(shard.filter((entry) => setupSet.has(entry))).toEqual(setup);
        }

        const payloads = shards.map((shard) => shard.filter((entry) => !setupSet.has(entry)));
        expect(intersection(payloads[0], payloads[1])).toEqual([]);
        expect(intersection(payloads[0], payloads[2])).toEqual([]);
        expect(intersection(payloads[1], payloads[2])).toEqual([]);
        expect(new Set(shards.flat())).toEqual(new Set(full));
    }, 20_000);

    it("isolates E2E artifacts by suite and shard", () => {
        const workflow = contents(TESTS_WORKFLOW);
        const names = [
            ...workflow.matchAll(/^\s+name: (playwright-(?:report|results)-[^\n]+)$/gm),
        ].map(([, name]) => name);

        expect(names).toHaveLength(8);
        expect(new Set(names).size).toBe(names.length);
        expect(names.join("\n")).toContain("default-${{ matrix.shard }}");
        expect(names.join("\n")).toContain("onboarding");
        expect(names.join("\n")).toContain("context-fabric");
        expect(names.join("\n")).toContain("pagerduty-final-qa");
    });

    it("runs static E2E only for tags and manual dispatch", () => {
        const e2e = job(contents(STATIC_WORKFLOW), "test-e2e");

        expect(e2e).toContain("github.event_name == 'workflow_dispatch'");
        expect(e2e).toContain("startsWith(github.ref, 'refs/tags/')");
        expect(e2e).not.toContain("github.event_name == 'pull_request'");
        expect(e2e).not.toContain("github.ref == 'refs/heads/main'");
    });

    it("tracks both static-build helper scripts in change detection", () => {
        const changes = job(contents(STATIC_WORKFLOW), "changes");

        expect(changes).toContain("- 'scripts/design-lint.mjs'");
        expect(changes).toContain("- '.github/scripts/generate-version-tag.sh'");
    });

    it("uses a dedicated E2E filter that excludes docs-only changes", () => {
        const workflow = contents(TESTS_WORKFLOW);
        const changes = job(workflow, "changes");
        const e2eFilter = changes.match(
            /^                      e2e:\n([\s\S]*?)(?=^                      [A-Za-z0-9-]+:|$(?![\s\S]))/m,
        );

        expect(changes).toContain("e2e: ${{ steps.filter.outputs.e2e }}");
        expect(changes).toContain("- 'docs/**'");
        expect(e2eFilter, "missing dedicated e2e path filter").not.toBeNull();
        expect(e2eFilter[0]).toContain("- 'pnpm-lock.yaml'");
        expect(e2eFilter[0]).toContain("- 'scripts/**'");
        expect(e2eFilter[0]).not.toContain("- 'docs/**'");
    });

    it("runs E2E for every root configuration that can change rendered runtime behavior", () => {
        const changes = job(contents(TESTS_WORKFLOW), "changes");
        const e2eFilter = changes.match(
            /^                      e2e:\n([\s\S]*?)(?=^                      [A-Za-z0-9-]+:|$(?![\s\S]))/m,
        );

        expect(e2eFilter, "missing dedicated e2e path filter").not.toBeNull();
        for (const pathPattern of [
            "- 'tsconfig.json'",
            "- 'postcss.config.*'",
            "- 'instrumentation.ts'",
            "- 'sentry.*.config.ts'",
        ]) {
            expect(e2eFilter[0]).toContain(pathPattern);
        }
    });

    it("tracks every root Playwright config in both code and E2E filters", () => {
        const changes = job(contents(TESTS_WORKFLOW), "changes");
        const e2eFilter = changes.match(
            /^                      e2e:\n([\s\S]*?)(?=^                      [A-Za-z0-9-]+:|$(?![\s\S]))/m,
        );

        expect(e2eFilter, "missing dedicated e2e path filter").not.toBeNull();
        for (const filter of [changes, e2eFilter[0]]) {
            expect(filter).toContain("- 'playwright*.config.*'");
        }
    });

    it("exposes split E2E harness tiers with an explicit positional shard", () => {
        const harness = contents(HARNESS);

        expect(harness).toContain("e2e-default");
        expect(harness).toContain("e2e-onboarding");
        expect(harness).toContain("e2e-context-fabric");
        expect(harness).toMatch(/e2e-default\)\n\s+run_e2e_default "\$2"/);
        expect(harness).toMatch(/e2e-onboarding\)\n\s+run_e2e_onboarding/);
        expect(harness).toMatch(/e2e-context-fabric\)\n\s+run_e2e_context_fabric/);
    });

    it("rejects artifact cleanup roots outside an isolated test-results subdirectory", () => {
        const harness = contents(HARNESS);

        expect(harness).toContain("validate_playwright_artifact_root");
        expect(harness).toContain("must be a safe subdirectory of test-results");
    });

    it("fails unsafe artifact overrides before installing a browser", () => {
        const result = runHarness(["e2e-onboarding"], {
            PLAYWRIGHT_REPORT_DIR: "/tmp/playwright-report",
            PLAYWRIGHT_RESULTS_DIR: "/tmp/playwright-results",
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("must be a safe subdirectory of test-results");
        expect(result.stdout).not.toContain("playwright install");
    });

    it("rejects leading-zero shards before installing a browser", () => {
        const result = runHarness(["e2e-default", "09/10"]);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("expected current/total with positive integers");
        expect(result.stdout).not.toContain("playwright install");
    });

    it("forces the required static build to execute for merge queue commits", () => {
        const build = job(contents(STATIC_WORKFLOW), "build");

        expect(build).toContain("github.event_name == 'merge_group'");
    });

    it("makes each filtered auxiliary workflow react to changes in its own definition", () => {
        const workflows = [
            [BUILD_WORKFLOW, ".github/workflows/build.yml"],
            [STATIC_WORKFLOW, ".github/workflows/build-static.yml"],
            [DOCKER_WORKFLOW, ".github/workflows/build-docker.yml"],
            [LIVE_E2E_WORKFLOW, ".github/workflows/live-e2e.yml"],
        ];

        for (const [workflowPath, expectedFilter] of workflows) {
            expect(job(contents(workflowPath), "changes")).toContain(`- '${expectedFilter}'`);
        }
    });

    it("uses the application migrator without authorizing the River cutover", () => {
        const migrationStep = step(
            job(contents(LIVE_E2E_WORKFLOW), "live-e2e"),
            "Run dev-health-ops migrations",
        );

        expect(migrationStep).toContain("python -m dev_health_ops.cli");
        expect(migrationStep).toContain('--db "$DATABASE_URI"');
        expect(migrationStep).toContain("migrate postgres");
        expect(migrationStep).not.toContain("alembic");
        expect(migrationStep).not.toContain("DEV_HEALTH_ALLOW_CELERY_RIVER_CUTOVER");
    });

    it("pins paths-filter to the reviewed commit in every touched workflow", () => {
        for (const workflowPath of [
            TESTS_WORKFLOW,
            BUILD_WORKFLOW,
            STATIC_WORKFLOW,
            DOCKER_WORKFLOW,
            LIVE_E2E_WORKFLOW,
        ]) {
            const workflow = contents(workflowPath);

            expect(workflow).not.toMatch(/dorny\/paths-filter@v/);
            expect(workflow).toContain(
                "dorny/paths-filter@7b450fff21473bca461d4b92ce414b9d0420d706",
            );
        }
    });

    it("keeps the default Playwright server on the legacy flag-off onboarding path", () => {
        expect(contents(DEFAULT_PLAYWRIGHT_CONFIG)).toContain(
            'NEXT_PUBLIC_GUIDED_ONBOARDING: "false"',
        );
    });
});
