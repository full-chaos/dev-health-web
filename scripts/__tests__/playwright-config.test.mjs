import { describe, expect, it } from "vitest";
import config from "../../playwright.config.ts";

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
});
