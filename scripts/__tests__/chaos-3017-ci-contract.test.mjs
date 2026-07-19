import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TESTS_WORKFLOW = path.join(ROOT, ".github/workflows/tests.yml");
const STATIC_WORKFLOW = path.join(ROOT, ".github/workflows/build-static.yml");
const BUILD_WORKFLOW = path.join(ROOT, ".github/workflows/build.yml");
const DOCKER_WORKFLOW = path.join(ROOT, ".github/workflows/build-docker.yml");
const LIVE_E2E_WORKFLOW = path.join(ROOT, ".github/workflows/live-e2e.yml");
const HARNESS = path.join(ROOT, "ci/run_tests.sh");
const DEFAULT_PLAYWRIGHT_CONFIG = path.join(ROOT, "playwright.config.ts");

function contents(file) {
    return fs.readFileSync(file, "utf8");
}

function runHarness(args, environment = {}) {
    return spawnSync("bash", [HARNESS, ...args], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, ...environment },
    });
}

function job(workflow, id) {
    const match = workflow.match(
        new RegExp(`^    ${id}:\\n([\\s\\S]*?)(?=^    [A-Za-z0-9-]+:|$(?![\\s\\S]))`, "m"),
    );
    expect(match, `missing ${id} job`).not.toBeNull();
    return match[0];
}

describe("CHAOS-3017 CI contracts", () => {
    it("preserves the required Build Static Assets and test check names", () => {
        expect(contents(STATIC_WORKFLOW)).toMatch(/^name: Build Static Assets$/m);
        expect(job(contents(TESTS_WORKFLOW), "test")).toMatch(/^        name: test$/m);
    });

    it("makes the test aggregator fail closed on its explicit required stages", () => {
        const aggregator = job(contents(TESTS_WORKFLOW), "test");

        expect(aggregator).toMatch(
            /needs: \[changes, format, quality, build, unit, integration, e2e-default, e2e-onboarding, e2e-context-fabric\]/,
        );
        expect(aggregator).not.toContain("toJson(needs)");
        for (const stage of [
            "format",
            "quality",
            "build",
            "unit",
            "integration",
            "e2e-default",
            "e2e-onboarding",
            "e2e-context-fabric",
        ]) {
            expect(aggregator).toContain(`needs.${stage}.result`);
        }
    });

    it("fans default E2E into three independent shards and dedicated suites", () => {
        const workflow = contents(TESTS_WORKFLOW);
        const defaultE2e = job(workflow, "e2e-default");

        expect(defaultE2e).toMatch(/fail-fast: false/);
        expect(defaultE2e).toMatch(/shard: \[1, 2, 3\]/);
        expect(defaultE2e).toMatch(
            /bash ci\/run_tests\.sh e2e-default \$\{\{ matrix\.shard \}\}\/3/,
        );
        expect(job(workflow, "e2e-onboarding")).toContain("bash ci/run_tests.sh e2e-onboarding");
        expect(job(workflow, "e2e-context-fabric")).toContain(
            "bash ci/run_tests.sh e2e-context-fabric",
        );
    });

    it("isolates E2E artifacts by suite and shard", () => {
        const workflow = contents(TESTS_WORKFLOW);
        const names = [
            ...workflow.matchAll(/^\s+name: (playwright-(?:report|results)-[^\n]+)$/gm),
        ].map(([, name]) => name);

        expect(names).toHaveLength(6);
        expect(new Set(names).size).toBe(names.length);
        expect(names.join("\n")).toContain("default-${{ matrix.shard }}");
        expect(names.join("\n")).toContain("onboarding");
        expect(names.join("\n")).toContain("context-fabric");
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

    it("caps default CI Playwright concurrency at six workers", () => {
        expect(contents(DEFAULT_PLAYWRIGHT_CONFIG)).toContain("workers: isCI ? 6 : undefined");
    });
});
