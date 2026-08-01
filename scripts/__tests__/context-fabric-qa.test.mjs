import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { main, removeGuidedBuildOutput, run } from "../context-fabric-qa.mjs";
import { resolvePackageManagerCommand } from "../package-manager.mjs";

describe("Context Fabric QA launcher", () => {
    it("resolves an absolute readable POSIX .mjs package-manager script", () => {
        const directory = mkdtempSync(join(tmpdir(), "context-fabric-qa-"));
        const npmExecPath = join(directory, "pnpm entry.mjs");
        writeFileSync(npmExecPath, "#!/usr/bin/env node\n");

        expect(resolvePackageManagerCommand({ platform: "darwin", npmExecPath })).toEqual({
            command: process.execPath,
            args: [npmExecPath],
        });
    });

    it("resolves a readable Windows CJS path with spaces without a cmd shim", () => {
        const npmExecPath = "C:\\Program Files\\pnpm\\pnpm entry.cjs";

        expect(
            resolvePackageManagerCommand({
                platform: "win32",
                npmExecPath,
                isReadable: () => true,
            }),
        ).toEqual({ command: process.execPath, args: [npmExecPath] });
    });

    it.each([
        [undefined, "npm_execpath from the package manager"],
        ["relative/pnpm.js", "absolute"],
        ["/tmp/pnpm.js", "cannot read npm_execpath"],
    ])("rejects unsafe npm_execpath %j", (npmExecPath, message) => {
        expect(() =>
            resolvePackageManagerCommand({
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

    it("uses the npm package-manager entrypoint for both package-manager phases", async () => {
        const commands = [];
        const npmExecPath = "C:\\Program Files\\pnpm\\pnpm.cjs";
        const runCommand = vi.fn(async (command, args) => {
            commands.push([command, args]);
            return 0;
        });
        const cleanGuidedBuildOutput = vi.fn(async () => {
            commands.push(["clean-guided-build-output", []]);
        });

        await expect(
            main({
                platform: "win32",
                npmExecPath,
                isReadable: () => true,
                runCommand,
                cleanGuidedBuildOutput,
            }),
        ).resolves.toBe(0);
        expect(commands).toEqual([
            ["clean-guided-build-output", []],
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

    it("removes the ignored guided build output before building", async () => {
        const rmImplementation = vi.fn(async () => {});
        await removeGuidedBuildOutput({
            rmImplementation,
            guidedDir: "/repo/.next-guided",
        });
        expect(rmImplementation).toHaveBeenCalledWith("/repo/.next-guided", {
            recursive: true,
            force: true,
        });
    });
});
