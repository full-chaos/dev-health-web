import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { main, preflightOpenSSL, resolvePnpmCommand, run } from "../context-fabric-qa.mjs";

describe("Context Fabric QA launcher", () => {
    it("resolves an absolute readable POSIX package-manager script", () => {
        const directory = mkdtempSync(join(tmpdir(), "context-fabric-qa-"));
        const npmExecPath = join(directory, "pnpm entry.js");
        writeFileSync(npmExecPath, "#!/usr/bin/env node\n");

        expect(resolvePnpmCommand({ platform: "darwin", npmExecPath })).toEqual({
            command: process.execPath,
            args: [npmExecPath],
        });
    });

    it("resolves a readable Windows CJS path with spaces without a cmd shim", () => {
        const npmExecPath = "C:\\Program Files\\pnpm\\pnpm entry.cjs";

        expect(
            resolvePnpmCommand({
                platform: "win32",
                npmExecPath,
                isReadable: () => true,
            }),
        ).toEqual({ command: process.execPath, args: [npmExecPath] });
    });

    it.each([
        [undefined, "npm_execpath from the package manager"],
        ["relative/pnpm.js", "absolute"],
        ["/tmp/pnpm.mjs", "JavaScript (.js or .cjs)"],
        ["/tmp/pnpm.js", "cannot read npm_execpath"],
    ])("rejects unsafe npm_execpath %j", (npmExecPath, message) => {
        expect(() =>
            resolvePnpmCommand({
                platform: "darwin",
                npmExecPath,
                isReadable: () => npmExecPath !== "/tmp/pnpm.js",
            }),
        ).toThrow(message);
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
            shell: false,
        });
    });

    it("reports the OpenSSL prerequisite with an actionable error", async () => {
        const runCommand = vi.fn(() => Promise.reject(new Error("spawn openssl ENOENT")));

        await expect(preflightOpenSSL({ runCommand })).rejects.toThrow(
            "Install OpenSSL and reopen your terminal",
        );
        expect(runCommand).toHaveBeenCalledWith("openssl", ["version"]);
    });

    it("uses the npm package-manager entrypoint for both package-manager phases", async () => {
        const commands = [];
        const npmExecPath = "C:\\Program Files\\pnpm\\pnpm.cjs";
        const runCommand = vi.fn(async (command, args) => {
            commands.push([command, args]);
            return 0;
        });

        await expect(
            main({
                platform: "win32",
                npmExecPath,
                isReadable: () => true,
                runCommand,
            }),
        ).resolves.toBe(0);
        expect(commands).toEqual([
            ["openssl", ["version"]],
            [process.execPath, [npmExecPath, "build"]],
            [
                process.execPath,
                [
                    npmExecPath,
                    "exec",
                    "playwright",
                    "test",
                    "-c",
                    "playwright.context-fabric.config.ts",
                ],
            ],
        ]);
    });
});
