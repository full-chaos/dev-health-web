import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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
    shouldForwardSupervisorSignal,
} from "../owned-process-lifecycle.mjs";
import { selectOwnedTreeController } from "../owned-process-controller.mjs";

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

    it("uses Node launchers that work without a POSIX shell", () => {
        const webServers = config.webServer;
        if (!Array.isArray(webServers))
            throw new Error("Context Fabric requires individual web servers.");

        expect(webServers.map((server) => server.command)).toEqual([
            "node scripts/context-fabric-launch.mjs ops-mock",
            "node scripts/context-fabric-launch.mjs acr-mock",
            "node scripts/context-fabric-launch.mjs bff",
        ]);
        for (const server of webServers) {
            expect(server.command).not.toMatch(/&&|\bexec\b|\bmkdir\b|\brm\b|\bcp\b|\bchmod\b/);
        }
    });

    it("uses a Node environment launcher for the documented Context Fabric QA command", async () => {
        const packagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
        const packageJson = JSON.parse(await readFile(packagePath, "utf8"));

        expect(packageJson.scripts["test:e2e:context-fabric"]).toBe(
            "node scripts/context-fabric-qa.mjs",
        );
    });

    it("lets a POSIX process-group signal reach the supervisor exactly once", () => {
        expect(shouldForwardSupervisorSignal("linux")).toBe(false);
        expect(shouldForwardSupervisorSignal("darwin")).toBe(false);
        expect(shouldForwardSupervisorSignal("win32")).toBe(true);
    });

    it("selects the Windows owned-process controller on win32", () => {
        const controller = { start: vi.fn(), stop: vi.fn() };
        const createWindowsTree = vi.fn(() => controller);

        expect(selectOwnedTreeController({ createWindowsTree, platform: "win32" })).toBe(
            controller,
        );
        expect(createWindowsTree).toHaveBeenCalledOnce();
    });
});
