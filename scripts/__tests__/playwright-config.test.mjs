import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../../playwright.config.ts";
import customerPushConfig from "../../playwright.customer-push.config.ts";
import navigationConfig from "../../playwright.navigation.config.ts";

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

    it("moves proven route-stress specs to a short-lived Webpack suite", () => {
        expect(config.testIgnore).toContain("admin-customer-push.spec.ts");
        expect(config.testIgnore).toContain("nav-reachability.spec.ts");
        const authenticatedProject = config.projects?.find(
            (project) => project.name === "authenticated",
        );
        expect(authenticatedProject?.testIgnore).toContainEqual(/admin-customer-push\.spec\.ts/);
        expect(authenticatedProject?.testIgnore).toContainEqual(/nav-reachability\.spec\.ts/);
        expect(customerPushConfig.workers).toBe(1);
        expect(customerPushConfig.projects?.map((project) => project.name)).toEqual([
            "customer-push-auth-setup",
            "customer-push",
        ]);
        expect(navigationConfig.workers).toBe(1);
        expect(navigationConfig.projects?.map((project) => project.name)).toEqual([
            "navigation-auth-setup",
            "navigation",
        ]);

        for (const dedicatedConfig of [customerPushConfig, navigationConfig]) {
            const webServers = dedicatedConfig.webServer;
            expect(Array.isArray(webServers)).toBe(true);
            expect(webServers).toHaveLength(2);
            expect(webServers.map((server) => server.reuseExistingServer)).toEqual([false, false]);
        }
        expect(customerPushConfig.webServer?.[1]?.command).toContain(" --webpack ");
        expect(navigationConfig.webServer?.[1]?.command).toContain(
            "npm run dev -- --hostname 127.0.0.1 --port 3005",
        );
        expect(navigationConfig.webServer?.[1]?.env).toMatchObject({
            NEXT_DIST_DIR: ".next/navigation",
        });

        expect(packageJson.scripts["test:e2e:customer-push"]).toBe(
            "playwright test -c playwright.customer-push.config.ts",
        );
        expect(packageJson.scripts["test:e2e:navigation"]).toBe(
            "playwright test -c playwright.navigation.config.ts",
        );
        expect(ciRunner).toContain("run_e2e_customer_push()");
        expect(ciRunner).toContain("run_e2e_navigation()");
        expect(ciRunner).toContain('run_timed "customer-push dev reset" reset_dev_output');
        expect(ciRunner).toContain('run_timed "navigation dev reset" reset_navigation_output');
        expect(ciRunner).toMatch(/e2e-customer-push\)\n\s+run_e2e_customer_push/);
        expect(ciRunner).toMatch(/e2e-navigation\)\n\s+run_e2e_navigation/);
        expect(testsWorkflow).toContain("bash ci/run_tests.sh e2e-customer-push");
        expect(testsWorkflow).toContain("bash ci/run_tests.sh e2e-navigation");
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
        expect(pagerDutyProject?.testMatch).toEqual(/pagerduty-final-qa-p[0-3]\.spec\.ts/);
        expect(authenticatedProject?.testIgnore).toContainEqual(
            /pagerduty-final-qa-p[0-3]\.spec\.ts/,
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

    it("keeps the PagerDuty matrix as a manual tier, out of CI (concurrency budget)", () => {
        // The signoff evidence pack stays runnable by hand…
        expect(ciRunner).toContain("run_pagerduty_final_qa()");
        expect(ciRunner).toContain(
            "run_isolated_e2e_suite pagerduty-final-qa test:e2e:pagerduty-final-qa",
        );
        expect(ciRunner).toMatch(/pagerduty-final-qa\)\n    run_pagerduty_final_qa/);
        // …but no workflow spends a runner on it per PR.
        expect(testsWorkflow).not.toContain("pagerduty-final-qa");
        expect(staticBuildWorkflow).not.toContain("pagerduty-final-qa");
    });
});
