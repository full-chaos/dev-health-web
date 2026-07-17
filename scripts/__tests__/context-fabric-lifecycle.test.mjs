import { describe, expect, it } from "vitest";
import config, {
    ACR_API_ORIGIN,
    BFF_ORIGIN,
    OPS_MOCK_ORIGIN,
} from "../../playwright.context-fabric.config.ts";
import {
    OWNED_PROCESS_CLEANUP_SAFETY_MARGIN_MS,
    OWNED_PROCESS_ESCALATION_TIMEOUT_MS,
    OWNED_PROCESS_WAIT_TIMEOUT_MS,
    PLAYWRIGHT_GRACEFUL_SHUTDOWN_TIMEOUT_MS,
} from "../owned-process-lifecycle.mjs";

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

    it("reserves an explicit margin after both supervisor cleanup waits", () => {
        expect(OWNED_PROCESS_CLEANUP_SAFETY_MARGIN_MS).toBeGreaterThan(0);
        expect(2 * OWNED_PROCESS_WAIT_TIMEOUT_MS).toBeLessThan(
            PLAYWRIGHT_GRACEFUL_SHUTDOWN_TIMEOUT_MS,
        );
        expect(
            PLAYWRIGHT_GRACEFUL_SHUTDOWN_TIMEOUT_MS - 2 * OWNED_PROCESS_WAIT_TIMEOUT_MS,
        ).toBeGreaterThanOrEqual(OWNED_PROCESS_CLEANUP_SAFETY_MARGIN_MS);
    });

    it("keeps browser-facing BFF and server-only ACR origins distinct", () => {
        expect(BFF_ORIGIN).toBe("http://127.0.0.1:3012");
        expect(OPS_MOCK_ORIGIN).toBe("http://127.0.0.1:8012");
        expect(ACR_API_ORIGIN).toBe("https://127.0.0.1:8013");
        expect(ACR_API_ORIGIN).not.toBe(BFF_ORIGIN);

        const webServers = config.webServer;
        if (!Array.isArray(webServers))
            throw new Error("Context Fabric requires individual web servers.");

        expect(webServers.map((server) => server.url)).toEqual([
            `${OPS_MOCK_ORIGIN}/health`,
            `${ACR_API_ORIGIN}/health`,
            BFF_ORIGIN,
        ]);
        expect(webServers[2]?.env).toMatchObject({
            ACR_API_ORIGIN,
            BACKEND_URL: OPS_MOCK_ORIGIN,
        });
    });
});
