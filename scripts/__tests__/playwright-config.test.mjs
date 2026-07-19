import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../../playwright.config.ts";

const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);
const ciRunner = readFileSync(new URL("../../ci/run_tests.sh", import.meta.url), "utf8");
const testsWorkflow = readFileSync(
    new URL("../../.github/workflows/tests.yml", import.meta.url),
    "utf8",
);
const staticBuildWorkflow = readFileSync(
    new URL("../../.github/workflows/build-static.yml", import.meta.url),
    "utf8",
);

describe("default Playwright web servers", () => {
    it("does not reuse a listener from another worktree", () => {
        const webServers = config.webServer;

        expect(Array.isArray(webServers)).toBe(true);
        expect(webServers).toHaveLength(2);
        expect(webServers.map((server) => server.reuseExistingServer)).toEqual([false, false]);
    });

    it("does not configure an unsupported private Next dev-overlay flag", () => {
        const webServers = config.webServer;

        expect(Array.isArray(webServers)).toBe(true);
        expect(webServers[1]?.env).not.toHaveProperty("NEXT_PRIVATE_DISABLE_DEV_OVERLAY_UX");
    });

    it("isolates stateful PagerDuty QA files in one dedicated worker", () => {
        const pagerDutyProject = config.projects?.find(
            (project) => project.name === "pagerduty-final-qa",
        );
        const authenticatedProject = config.projects?.find(
            (project) => project.name === "authenticated",
        );

        expect(pagerDutyProject).toMatchObject({
            dependencies: ["auth-setup"],
            name: "pagerduty-final-qa",
            workers: 1,
        });
        expect(pagerDutyProject?.testMatch).toEqual(/pagerduty-final-qa-p[012]\.spec\.ts/);
        expect(authenticatedProject?.testIgnore).toContainEqual(
            /pagerduty-final-qa-p[012]\.spec\.ts/,
        );
    });

    it("keeps stateful PagerDuty QA out of the canonical E2E command", () => {
        expect(packageJson.scripts["test:e2e"]).toBe(
            "playwright test --project=authenticated --project=unauthenticated",
        );
        expect(packageJson.scripts["test:e2e:pagerduty-final-qa"]).toBe(
            "playwright test --project=pagerduty-final-qa",
        );
        expect(packageJson.scripts["test:e2e:pagerduty-final-qa:smoke"]).toBe(
            "playwright test --project=pagerduty-final-qa tests/pagerduty-final-qa-p0.spec.ts",
        );
    });

    it("runs the dedicated PagerDuty smoke separately in CI", () => {
        expect(ciRunner).toContain("run_pagerduty_final_qa()");
        expect(ciRunner).toContain(
            "run_isolated_e2e_suite pagerduty-final-qa test:e2e:pagerduty-final-qa:smoke",
        );
        expect(ciRunner).toMatch(/pagerduty-final-qa\)\n    run_pagerduty_final_qa/);
        expect(testsWorkflow).toMatch(
            /pagerduty-final-qa:\n        name: PagerDuty final QA smoke/,
        );
        expect(testsWorkflow).toContain("bash ci/run_tests.sh pagerduty-final-qa");
        expect(ciRunner).toContain(
            'run_pagerduty_final_qa "${PLAYWRIGHT_REPORT_ROOT}/pagerduty-final-qa" "${PLAYWRIGHT_RESULTS_ROOT}/pagerduty-final-qa"',
        );
        expect(staticBuildWorkflow).toContain("bash ci/run_tests.sh pagerduty-final-qa");
        expect(staticBuildWorkflow).toContain(
            "PLAYWRIGHT_RESULTS_DIR=test-results/playwright/pagerduty-final-qa",
        );
    });
});
