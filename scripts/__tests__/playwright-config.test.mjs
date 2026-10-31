import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config, { findScenarioSetterSpecs } from "../../playwright.config.ts";
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
            "playwright test --project=authenticated --project=entitlement-scenario --project=unauthenticated",
        );
        expect(packageJson.scripts["test:e2e"]).not.toContain("pagerduty-final-qa");
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

// CHAOS-12170: the mock's entitlement scenario is process-global, so every spec of the default
// suite that sets it runs in one serial project, never in the parallel `authenticated` one.
describe("entitlement-scenario specs run one at a time", () => {
    const testsDir = new URL("../../tests/", import.meta.url);
    // An independent scan (not the config's own list): every default-suite spec that sets it,
    // directly or through a test helper module that does.
    const source = (file) => readFileSync(new URL(file, testsDir), "utf8");
    const setterHelpers = readdirSync(testsDir)
        .filter((file) => file.endsWith(".ts") && !file.endsWith(".spec.ts"))
        .filter((file) => source(file).includes("/__test/entitlements"))
        .map((file) => file.replace(/\.ts$/u, ""));
    const flipping = readdirSync(testsDir)
        .filter((file) => file.endsWith(".spec.ts"))
        .filter(
            (file) => !/\.production\.spec\.ts$|^pagerduty-final-qa-p[0-3]\.spec\.ts$/u.test(file),
        )
        .filter(
            (file) =>
                source(file).includes("/__test/entitlements") ||
                setterHelpers.some((helper) => source(file).includes(`"./${helper}"`)),
        )
        .sort();
    const project = (name) => config.projects?.find((candidate) => candidate.name === name);
    const matches = (patterns, file) =>
        [patterns]
            .flat()
            .some((pattern) => (pattern instanceof RegExp ? pattern.test(`tests/${file}`) : false));

    it("finds the specs that set it, including the race canaries", () => {
        expect(flipping).toContain("ask-dev-launcher.spec.ts");
        // Sets it through a helper module (codex r1 on #1634), not by the endpoint text itself.
        expect(flipping).toContain("admin-integrations.spec.ts");
        expect(flipping).toContain("entitlement-scenario-race-a.spec.ts");
        expect(flipping).toContain("entitlement-scenario-race-b.spec.ts");
        expect(flipping.length).toBeGreaterThanOrEqual(15);
    });

    it("puts each of them in the serial project and none in the parallel one", () => {
        const serial = project("entitlement-scenario");
        const parallel = project("authenticated");
        expect(serial?.workers).toBe(1);
        for (const file of flipping) {
            expect(matches(serial?.testMatch, file), `${file} in entitlement-scenario`).toBe(true);
            expect(matches(parallel?.testIgnore, file), `${file} ignored by authenticated`).toBe(
                true,
            );
        }
        // A spec that does not set it stays in the parallel project.
        expect(matches(serial?.testMatch, "ask-dev-not-a-real.spec.ts")).toBe(false);
        expect(matches(parallel?.testIgnore, "filter-propagation.spec.ts")).toBe(false);
    });

    it("is selected by the default CI e2e script, so the specs still run in CI", () => {
        expect(packageJson.scripts["test:e2e"]).toContain("--project=entitlement-scenario");
        expect(packageJson.scripts["test:e2e"]).toContain("--project=authenticated");
    });
});

// CHAOS-12170 (codex r2 opinion on #1634): a setter helper in a subfolder, or one reached through
// another helper, sets the scenario too.
describe("the scenario-setter scan follows helper imports", () => {
    it("finds specs that set it directly, through a nested helper, and through two hops", () => {
        const root = mkdtempSync(join(tmpdir(), "chaos-12170-"));
        try {
            const write = (file, text) => {
                mkdirSync(join(root, file, ".."), { recursive: true });
                writeFileSync(join(root, file), text);
            };
            const post =
                "await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });";
            write("direct.spec.ts", post);
            write("helpers/entitlement.ts", `export async function set() { ${post} }`);
            write("helpers/indirect.ts", 'export { set } from "./entitlement";');
            write("nested.spec.ts", 'import { set } from "./helpers/entitlement";');
            write("two-hops.spec.ts", 'import { set } from "./helpers/indirect";');
            write("sub/deep.spec.ts", 'import { set } from "../helpers/entitlement";');
            write("unrelated.spec.ts", 'import { other } from "./helpers/other";');
            write("helpers/other.ts", "export const other = 1;");
            write("mocks/http-server.ts", 'app.post("/__test/entitlements", () => {});');
            write("live/x.spec.ts", post);
            write("y.production.spec.ts", post);
            expect(findScenarioSetterSpecs(root)).toEqual([
                "direct.spec.ts",
                "nested.spec.ts",
                "sub/deep.spec.ts",
                "two-hops.spec.ts",
            ]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
