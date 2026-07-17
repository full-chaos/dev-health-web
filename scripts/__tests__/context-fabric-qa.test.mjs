import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { main, preflightOpenSSL, resolvePnpmCommand, run } from "../context-fabric-qa.mjs";

describe("Context Fabric QA launcher", () => {
    it("uses the Windows pnpm command shim without enabling a shell", () => {
        expect(resolvePnpmCommand("win32")).toBe("pnpm.cmd");
        expect(resolvePnpmCommand("darwin")).toBe("pnpm");
    });

    it("preserves spaced arguments and environment through direct spawning", async () => {
        const child = new EventEmitter();
        const spawnImplementation = vi.fn(() => {
            queueMicrotask(() => child.emit("exit", 0));
            return child;
        });
        const environment = { PATH: "C:\\Program Files\\pnpm", QA_TOKEN: "test" };
        const args = ["exec", "playwright", "test", "tests/path with spaces.spec.ts"];

        await expect(run("pnpm.cmd", args, { environment, spawnImplementation })).resolves.toBe(0);
        expect(spawnImplementation).toHaveBeenCalledWith("pnpm.cmd", args, {
            env: environment,
            stdio: "inherit",
        });
    });

    it("reports the OpenSSL prerequisite with an actionable error", async () => {
        const runCommand = vi.fn(() => Promise.reject(new Error("spawn openssl ENOENT")));

        await expect(preflightOpenSSL({ runCommand })).rejects.toThrow(
            "Install OpenSSL and reopen your terminal",
        );
        expect(runCommand).toHaveBeenCalledWith("openssl", ["version"]);
    });

    it("uses the Windows shim for both package-manager phases", async () => {
        const commands = [];
        const runCommand = vi.fn(async (command) => {
            commands.push(command);
            return 0;
        });

        await expect(main({ platform: "win32", runCommand })).resolves.toBe(0);
        expect(commands).toEqual(["openssl", "pnpm.cmd", "pnpm.cmd"]);
    });
});
