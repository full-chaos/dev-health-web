import { describe, expect, it } from "vitest";
import config from "../../playwright.context-fabric.config.ts";
import { OWNED_PROCESS_ESCALATION_TIMEOUT_MS } from "../owned-process-lifecycle.mjs";

describe("Context Fabric Playwright lifecycle budgets", () => {
    it("leaves the owned-process supervisor enough time to escalate before Playwright stops it", () => {
        const webServers = config.webServer;
        if (!Array.isArray(webServers))
            throw new Error("Context Fabric requires individual web servers.");

        for (const server of webServers) {
            expect(server.gracefulShutdown?.timeout).toBeGreaterThan(
                OWNED_PROCESS_ESCALATION_TIMEOUT_MS,
            );
        }
    });
});
