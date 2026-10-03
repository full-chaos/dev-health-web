import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createGuardianCompletionCoordinator } from "../owned-process-guardian-completion.mjs";
import { waitForProcessGroupGone } from "../owned-process-posix.mjs";
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

function collectStderr(tree) {
    let text = "";
    tree.stderr.on("data", (chunk) => {
        text += chunk.toString();
    });
    return () => text;
}

function waitForExit(tree) {
    return new Promise((resolve) => tree.once("exit", resolve));
}

// Resolves on "close": the exit AND the end of the stdio pipes, so stderr is read to the end.
function waitForClose(tree) {
    return new Promise((resolve) => tree.once("close", resolve));
}

// Every process a test starts is recorded here and stopped in afterEach, so a failing or timed-out
// test cannot leave a process group behind (CHAOS-8426).
const started = [];
function startSupervised(args, options = {}) {
    const tree = spawn("node", [runner, ...args], {
        stdio: ["ignore", "pipe", "pipe"],
        ...options,
    });
    started.push({ kind: "supervisor", proc: tree });
    return tree;
}
function startUnrelated() {
    const proc = spawn("node", ["-e", unrelatedListener], { stdio: ["ignore", "pipe", "pipe"] });
    started.push({ kind: "unrelated", proc });
    return proc;
}
const isRunning = (proc) => proc.exitCode === null && proc.signalCode === null;

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

describe("waitForProcessGroupGone (CHAOS-8457)", () => {
    const clock = () => {
        let t = 0;
        return { now: () => t, wait: async (ms) => void (t += ms) };
    };

    it("polls until the group is gone", async () => {
        const { now, wait } = clock();
        let calls = 0;
        const exists = () => ++calls <= 3;

        await waitForProcessGroupGone(42, { deadlineMs: 1_000, exists, now, wait });

        expect(calls).toBe(4);
    });

    it("throws at the deadline when the group stays alive", async () => {
        const { now, wait } = clock();

        await expect(
            waitForProcessGroupGone(42, { deadlineMs: 100, exists: () => true, now, wait }),
        ).rejects.toThrow("remained alive");
    });

    it("returns at once when the group is already gone", async () => {
        const { now, wait } = clock();

        await waitForProcessGroupGone(42, { deadlineMs: 100, exists: () => false, now, wait });
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
    afterEach(async () => {
        const leftovers = started.splice(0);
        const leaked = [];
        for (const { kind, proc } of leftovers) {
            if (!isRunning(proc)) continue;
            // A supervisor is stopped with SIGTERM so it can clean its own group; SIGKILL on it would
            // leave the group behind. Only the unrelated listener (no group of its own) gets SIGKILL.
            proc.kill(kind === "supervisor" ? "SIGTERM" : "SIGKILL");
            const exited = await Promise.race([
                waitForExit(proc).then(() => true),
                new Promise((resolve) => setTimeout(() => resolve(false), 10_000)),
            ]);
            if (!exited) leaked.push(`${kind} ${proc.pid}`);
        }
        // Loud, not silent: a process that would not stop is a failure of the test, not a skipped cleanup.
        expect(leaked).toEqual([]);
    }, 30_000);

    it("returns the owned command exit code after its guardian has drained the group", async () => {
        const tree = startSupervised(["node", "-e", "process.exit(7)"]);

        const code = await waitForExit(tree);

        expect(code).toBe(7);
    }, 15_000);

    it("releases an exact owned grandchild listener when its process group stops", async () => {
        const tree = startSupervised(["node", "-e", grandchildListener]);
        const listenerProcess = await waitForListener(tree);

        tree.kill("SIGTERM");
        await waitForExit(tree);

        expect(await portIsReleased(listenerProcess.port)).toBe(true);
        expect(() => process.kill(listenerProcess.pid, 0)).toThrow();
    }, 15_000);

    it("kills a stubborn owned grandchild before the outer shutdown budget expires", async () => {
        const tree = startSupervised(["node", "-e", stubbornGrandchildListener]);
        const listenerProcess = await waitForListener(tree);
        const startedAt = Date.now();
        const stderr = collectStderr(tree);

        tree.kill("SIGTERM");
        await waitForClose(tree);

        expect(Date.now() - startedAt).toBeLessThan(10_000);
        // The SIGKILL path completes from the guardian's death (it kills itself with its group): the
        // supervisor says so, then verifies the group before it exits.
        expect(stderr()).toContain("the guardian exited before announcing drain");
        expect(await portIsReleased(listenerProcess.port)).toBe(true);
        expect(() => process.kill(listenerProcess.pid, 0)).toThrow();
    }, 15_000);

    it("does not exit after SIGKILL until the owned group is gone, even when the guardian died first", async () => {
        // Seam: the supervisor reports the group as still alive for 40 extra polls after SIGKILL
        // (about 1 s). On the old code it exited as soon as the guardian's death was seen.
        const tree = startSupervised(["node", "-e", stubbornGrandchildListener], {
            env: { ...process.env, OWNED_PROCESS_TEST_GROUP_ALIVE_POLLS: "40" },
        });
        await waitForListener(tree);
        const stderr = collectStderr(tree);

        tree.kill("SIGTERM");
        await waitForClose(tree);

        const polls = /still there for (\d+) polls/u.exec(stderr())?.[1];
        expect(Number(polls)).toBeGreaterThanOrEqual(40);
    }, 15_000);

    it("cleans the verified owned group when its guardian exits unexpectedly", async () => {
        const tree = startSupervised(["node", "-e", grandchildListener]);
        const listenerProcess = await waitForListener(tree);
        const guardianProcessId = childProcessId(tree.pid);

        process.kill(guardianProcessId, "SIGKILL");
        const code = await waitForExit(tree);

        expect(code).not.toBe(0);
        expect(await portIsReleased(listenerProcess.port)).toBe(true);
        expect(() => process.kill(listenerProcess.pid, 0)).toThrow();
    }, 15_000);

    it("cleans a descendant when its target exited before its guardian unexpectedly exits", async () => {
        const tree = startSupervised(["node", "-e", targetExitsBeforeListener]);
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
        const unrelated = startUnrelated();
        const unrelatedProcess = await waitForListener(unrelated);
        const tree = startSupervised(["node", "-e", stubbornGrandchildListener]);
        const ownedListener = await waitForListener(tree);

        tree.kill("SIGTERM");
        await waitForExit(tree);

        expect(await portIsReleased(ownedListener.port)).toBe(true);
        expect(await portIsReleased(unrelatedProcess.port)).toBe(false);
        // afterEach stops the unrelated listener (and a supervisor that is still running).
    }, 15_000);
});
