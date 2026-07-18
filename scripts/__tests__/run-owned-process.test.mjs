import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createGuardianCompletionCoordinator } from "../owned-process-guardian-completion.mjs";
import {
    groupHasDescendants,
    groupMemberIdentities,
    parseProcessIds,
} from "../owned-process-posix-group.mjs";

const runner = fileURLToPath(new URL("../run-owned-process.mjs", import.meta.url));
const listener = [
    'const server = require("node:http").createServer();',
    'server.listen(0, "127.0.0.1", () => console.log(`${process.pid}:${server.address().port}`));',
].join("");
const grandchildListener = [
    'const { spawn } = require("node:child_process");',
    `const listener = spawn(process.execPath, ["-e", ${JSON.stringify(listener)}], { stdio: ["ignore", "pipe", "inherit"] });`,
    "listener.stdout.pipe(process.stdout);",
    "setInterval(() => undefined, 1_000);",
].join("");
const stubbornListener = [
    'process.on("SIGTERM", () => undefined);',
    'const server = require("node:http").createServer();',
    'server.listen(0, "127.0.0.1", () => console.log(process.pid + ":" + server.address().port));',
].join("");
const stubbornGrandchildListener = [
    'const { spawn } = require("node:child_process");',
    `const listener = spawn(process.execPath, ["-e", ${JSON.stringify(stubbornListener)}], { stdio: ["ignore", "pipe", "inherit"] });`,
    "listener.stdout.pipe(process.stdout);",
    "setInterval(() => undefined, 1_000);",
].join("");
const targetExitsBeforeListener = [
    'const { spawn } = require("node:child_process");',
    `const listener = spawn(process.execPath, ["-e", ${JSON.stringify(listener)}], { stdio: ["ignore", "pipe", "inherit"] });`,
    "listener.stdout.pipe(process.stdout);",
    "setTimeout(() => process.exit(0), 100);",
].join("");
const unrelatedListener = [
    'const server = require("node:http").createServer();',
    'server.listen(0, "127.0.0.1", () => console.log(process.pid + ":" + server.address().port));',
    "setInterval(() => undefined, 1_000);",
].join("");

function waitForListener(tree) {
    return new Promise((resolve, reject) => {
        let output = "";
        tree.stdout.on("data", (chunk) => {
            output += chunk.toString();
            const match = output.match(/(\d+):(\d+)/);
            if (match) resolve({ pid: Number(match[1]), port: Number(match[2]) });
        });
        tree.once("error", reject);
    });
}

function waitForExit(tree) {
    return new Promise((resolve) => tree.once("exit", resolve));
}

function portIsReleased(port) {
    return new Promise((resolve) => {
        const socket = net.connect({ host: "127.0.0.1", port });
        socket.once("connect", () => {
            socket.destroy();
            resolve(false);
        });
        socket.once("error", () => resolve(true));
    });
}

function childProcessId(parentProcessId) {
    const result = spawnSync("ps", ["-o", "pid=", "-o", "ppid=", "-ax"], { encoding: "utf8" });
    const child = result.stdout
        .trim()
        .split("\n")
        .map((line) => line.trim().split(/\s+/).map(Number))
        .find((processInfo) => processInfo[1] === parentProcessId);
    if (child?.[0] === undefined) throw new Error("Owned process guardian was not available.");
    return child[0];
}

describe("owned POSIX group inspection", () => {
    const guardianPid = 123;
    const childPid = 456;

    function pgrepResult(stdout) {
        return () => ({ status: 0, stderr: "", stdout });
    }

    function identityFor(pid) {
        return { pgid: guardianPid, pid, startedAt: "Tue Jul 15 12:00:00 2026" };
    }

    it("treats Linux self-only pgrep output with a trailing newline as an empty descendant set", () => {
        const inspect = pgrepResult(`${guardianPid}\n`);

        expect(parseProcessIds(`${guardianPid}\n`)).toEqual([guardianPid]);
        expect(groupHasDescendants(guardianPid, guardianPid, inspect)).toBe(false);
        expect(groupMemberIdentities(guardianPid, guardianPid, inspect, identityFor)).toEqual([]);
    });

    it("retains a real descendant from Linux pgrep output with a trailing newline", () => {
        const inspect = pgrepResult(`${guardianPid}\n${childPid}\n`);

        expect(groupHasDescendants(guardianPid, guardianPid, inspect)).toBe(true);
        expect(groupMemberIdentities(guardianPid, guardianPid, inspect, identityFor)).toEqual([
            identityFor(childPid),
        ]);
    });
});

describe("guardian completion coordinator", () => {
    it("falls back to the guardian exit event when a drained message is dropped", async () => {
        const completion = createGuardianCompletionCoordinator();

        completion.completeFromExitEvent(7, null);

        expect(await completion.wait()).toBe("exit_event");
        expect(completion.terminalResult()).toEqual({ code: 7, signal: null });
    });

    it("completes from a valid drained message before a delayed guardian exit", async () => {
        const completion = createGuardianCompletionCoordinator();

        expect(
            completion.completeFromDrainedMessage({ code: 7, signal: null, type: "drained" }),
        ).toBe(true);

        expect(await completion.wait()).toBe("drained_message");
        expect(completion.terminalResult()).toEqual({ code: 7, signal: null });
    });
});

describe("run-owned-process", () => {
    it("returns the owned command exit code after its guardian has drained the group", async () => {
        const tree = spawn("node", [runner, "node", "-e", "process.exit(7)"], {
            stdio: ["ignore", "pipe", "pipe"],
        });

        const code = await waitForExit(tree);

        expect(code).toBe(7);
    }, 15_000);

    it("releases an exact owned grandchild listener when its process group stops", async () => {
        const tree = spawn("node", [runner, "node", "-e", grandchildListener], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        const listenerProcess = await waitForListener(tree);

        tree.kill("SIGTERM");
        await waitForExit(tree);

        expect(await portIsReleased(listenerProcess.port)).toBe(true);
        expect(() => process.kill(listenerProcess.pid, 0)).toThrow();
    }, 15_000);

    it("kills a stubborn owned grandchild before the outer shutdown budget expires", async () => {
        const tree = spawn("node", [runner, "node", "-e", stubbornGrandchildListener], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        const listenerProcess = await waitForListener(tree);
        const startedAt = Date.now();

        tree.kill("SIGTERM");
        await waitForExit(tree);

        expect(Date.now() - startedAt).toBeLessThan(10_000);
        expect(await portIsReleased(listenerProcess.port)).toBe(true);
        expect(() => process.kill(listenerProcess.pid, 0)).toThrow();
    }, 15_000);

    it("cleans the verified owned group when its guardian exits unexpectedly", async () => {
        const tree = spawn("node", [runner, "node", "-e", grandchildListener], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        const listenerProcess = await waitForListener(tree);
        const guardianProcessId = childProcessId(tree.pid);

        process.kill(guardianProcessId, "SIGKILL");
        const code = await waitForExit(tree);

        expect(code).not.toBe(0);
        expect(await portIsReleased(listenerProcess.port)).toBe(true);
        expect(() => process.kill(listenerProcess.pid, 0)).toThrow();
    }, 15_000);

    it("cleans a descendant when its target exited before its guardian unexpectedly exits", async () => {
        const tree = spawn("node", [runner, "node", "-e", targetExitsBeforeListener], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        const listenerProcess = await waitForListener(tree);
        await new Promise((resolve) => setTimeout(resolve, 150));
        const guardianProcessId = childProcessId(tree.pid);

        process.kill(guardianProcessId, "SIGKILL");
        const code = await waitForExit(tree);

        expect(code).not.toBe(0);
        expect(await portIsReleased(listenerProcess.port)).toBe(true);
        expect(() => process.kill(listenerProcess.pid, 0)).toThrow();
    }, 15_000);

    it("keeps an unrelated process alive while the guardian escalates its owned group", async () => {
        const unrelated = spawn("node", ["-e", unrelatedListener], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        const unrelatedProcess = await waitForListener(unrelated);
        const tree = spawn("node", [runner, "node", "-e", stubbornGrandchildListener], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        const ownedListener = await waitForListener(tree);

        tree.kill("SIGTERM");
        await waitForExit(tree);

        expect(await portIsReleased(ownedListener.port)).toBe(true);
        expect(await portIsReleased(unrelatedProcess.port)).toBe(false);
        unrelated.kill("SIGKILL");
        await waitForExit(unrelated);
    }, 15_000);
});
