import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    createWindowsOwnedTreeController,
    waitForWindowsLaunch,
} from "../owned-process-windows.mjs";

const windowsLauncher = fileURLToPath(new URL("../windows-owned-launch.ps1", import.meta.url));
const windowsArgumentCases = [
    "spaces in an argument",
    'embedded "quotes"',
    "trailing\\",
    "multiple\\\\backslashes\\\\",
    "café-東京-😀",
];

function waitForExit(child) {
    if (child.exitCode !== null) return Promise.resolve(child.exitCode);
    return new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
    });
}

const root = { createdAt: "2026-07-16T16:45:00.000Z", parentProcessId: 1, processId: 101 };
const child = { createdAt: "2026-07-16T16:45:01.000Z", parentProcessId: 101, processId: 202 };
const grandchild = {
    createdAt: "2026-07-16T16:45:02.000Z",
    parentProcessId: 202,
    processId: 303,
};

describe("Windows owned-process cleanup", () => {
    it("consumes a ready status before interpreting a fast helper exit", async () => {
        const helper = { exitCode: 1 };

        const status = await waitForWindowsLaunch({
            helper,
            readStatus: async () => JSON.stringify({ state: "ready", targetProcessId: 9002 }),
            statusPath: "unused",
            wait: async () => undefined,
        });

        expect(status).toEqual({ state: "ready", targetProcessId: 9002 });
    });

    it("waits for an atomically published complete ready status instead of parsing partial JSON", async () => {
        const absentStatusFile = Object.assign(new Error("not found"), { code: "ENOENT" });
        const reads = [
            absentStatusFile,
            '{"state":"ready","targetProcessId":',
            JSON.stringify({ state: "ready", targetProcessId: 9002 }),
        ];

        const status = await waitForWindowsLaunch({
            helper: { exitCode: null },
            readStatus: async () => {
                const read = reads.shift() ?? "";
                if (read instanceof Error) throw read;
                return read;
            },
            statusPath: "unused",
            wait: async () => undefined,
        });

        expect(status).toEqual({ state: "ready", targetProcessId: 9002 });
    });

    it.runIf(process.platform === "win32")(
        "preserves spaces, quotes, backslashes, and Unicode in target arguments",
        async () => {
            const statusDirectory = await mkdtemp(join(tmpdir(), "owned-process-arguments-"));
            const statusPath = join(statusDirectory, "status.json");
            const receivedArgumentsPath = join(statusDirectory, "received-arguments.json");
            const targetArgs = [
                "-e",
                'require("node:fs").writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))',
                receivedArgumentsPath,
                ...windowsArgumentCases,
            ];
            await writeFile(
                statusPath,
                JSON.stringify({ args: targetArgs, command: process.execPath }),
            );
            const helper = spawn(
                "powershell.exe",
                ["-NoProfile", "-NonInteractive", "-File", windowsLauncher, statusPath],
                { windowsHide: true },
            );

            try {
                await waitForWindowsLaunch({ helper, statusPath });
                await waitForExit(helper);
                expect(JSON.parse(await readFile(receivedArgumentsPath, "utf8"))).toEqual(
                    windowsArgumentCases,
                );
            } finally {
                helper.kill();
                await rm(statusDirectory, { force: true, recursive: true });
            }
        },
    );
    it("establishes Job Object ownership before an immediately exiting parent can orphan a grandchild", async () => {
        const events = [];
        const helper = { pid: 9001 };
        const controller = createWindowsOwnedTreeController({
            launch: async () => {
                events.push("assigned-before-resume");
                return { process: helper, targetProcessId: 9002 };
            },
            terminate: async (owned) => {
                events.push(`terminated-job:${owned.targetProcessId}`);
            },
        });

        const process = await controller.start("node", ["-e", "process.exit(0)"]);
        await controller.stop();

        expect(process).toBe(helper);
        expect(events).toEqual(["assigned-before-resume", "terminated-job:9002"]);
    });

    it("terminates a tracked owned descendant when its parent exits before cleanup", async () => {
        const snapshots = [[root, child, grandchild], [child, grandchild], []];
        const terminated = [];
        const controller = createWindowsOwnedTreeController({
            listProcesses: async () => snapshots.shift() ?? [],
            taskkill: async (processId) => {
                terminated.push(processId);
                return { status: 0 };
            },
            wait: async () => undefined,
        });

        await controller.track(root.processId);
        await controller.stop(root.processId);

        expect(terminated).toEqual([child.processId]);
    });

    it("fails closed when a tracked owned descendant remains after taskkill", async () => {
        const controller = createWindowsOwnedTreeController({
            listProcesses: async () => [root, child],
            maximumPolls: 1,
            taskkill: async () => ({ status: 0 }),
            wait: async () => undefined,
        });

        await controller.track(root.processId);

        await expect(controller.stop(root.processId)).rejects.toThrow(
            "Owned Windows process tree remained alive after taskkill.",
        );
    });
});
