import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { OWNED_PROCESS_WAIT_TIMEOUT_MS } from "./owned-process-lifecycle.mjs";
import { selectOwnedTreeController } from "./owned-process-controller.mjs";
import { processGroupExists, processGroupIsOwned } from "./owned-process-posix.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Expected a command to supervise");

const SHUTDOWN_TIMEOUT_MS = OWNED_PROCESS_WAIT_TIMEOUT_MS;
const POLL_INTERVAL_MS = 25;
const isWindows = process.platform === "win32";
const posixGuardian = fileURLToPath(new URL("./owned-process-posix-guardian.mjs", import.meta.url));
let child;
let stopping = false;
let requestedSignal;
let childExitCode;
let childExitSignal;
const ownedGroupMembers = new Map();

function cacheChildExit(code, signal) {
    childExitCode = code;
    childExitSignal = signal;
}

function retainOwnedGroupMember(member) {
    if (
        member === undefined ||
        !Number.isSafeInteger(member.pid) ||
        typeof member.startedAt !== "string"
    )
        return;
    ownedGroupMembers.set(`${member.pid}:${member.startedAt}`, member);
}

function hasVerifiedOwnedGroupMember(groupId) {
    return [...ownedGroupMembers.values()].some((member) =>
        processGroupIsOwned({ groupId, member }),
    );
}

function handleChildExit() {
    if (windowsTree === undefined && !stopping) {
        if (child.pid === undefined || !processGroupExists(child.pid))
            process.exit(exitCodeAfterCleanup());
        void stopOwnedProcess("SIGKILL", false);
        return;
    }
    void stopOwnedProcess("SIGTERM", false);
}

function recordWindowsHelperExit(code, signal) {
    cacheChildExit(code, signal);
    if (child !== undefined) handleChildExit();
}

const windowsTree = selectOwnedTreeController({
    onHelperExit: recordWindowsHelperExit,
    platform: isWindows ? "win32" : "posix",
});
child =
    windowsTree === undefined
        ? spawn(process.execPath, [posixGuardian, command, ...args], {
              detached: true,
              stdio: ["ignore", "inherit", "inherit", "ipc"],
              windowsHide: true,
          })
        : await windowsTree.start(command, args);
cacheChildExit(child.exitCode, child.signalCode);
if (windowsTree === undefined) {
    child.on("message", (message) => {
        if (message?.type === "ready") retainOwnedGroupMember(message.target);
        if (message?.type === "members" && Array.isArray(message.members))
            message.members.forEach(retainOwnedGroupMember);
    });
}

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForGuardianExit() {
    const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
    while (child.exitCode === null && child.signalCode === null) {
        if (Date.now() >= deadline) return false;
        await wait(POLL_INTERVAL_MS);
    }
    return true;
}

async function stopOwnedTree(signal) {
    if (child.pid === undefined) throw new Error("Owned process did not expose a PID.");

    if (windowsTree !== undefined) {
        await windowsTree.stop();
        return;
    }

    if (child.exitCode !== null || child.signalCode !== null) {
        if (child.pid === undefined || !hasVerifiedOwnedGroupMember(child.pid)) {
            throw new Error(
                "Unable to verify the exact owned POSIX process group after guardian exit.",
            );
        }
        process.kill(-child.pid, signal);
        const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
        while (processGroupExists(child.pid)) {
            if (Date.now() >= deadline)
                throw new Error("Verified owned POSIX process group remained alive after cleanup.");
            await wait(POLL_INTERVAL_MS);
        }
        return;
    }

    child.send({ signal, type: "stop" });
    if (await waitForGuardianExit()) return;

    child.send({ signal: "SIGKILL", type: "stop" });
    if (!(await waitForGuardianExit())) {
        throw new Error("Owned process group remained alive after SIGKILL.");
    }
}

function exitCodeAfterCleanup() {
    if (requestedSignal !== undefined) return 0;
    return childExitCode ?? (childExitSignal ? 1 : 0);
}

async function stopOwnedProcess(signal, fromSignal) {
    if (stopping) return;
    stopping = true;
    if (fromSignal) requestedSignal = signal;

    try {
        await stopOwnedTree(signal);
        process.exit(exitCodeAfterCleanup());
    } catch (error) {
        console.error(`Failed to stop owned process tree: ${errorMessage(error)}`);
        process.exit(1);
    }
}

process.once("SIGINT", () => {
    void stopOwnedProcess("SIGINT", true);
});
process.once("SIGTERM", () => {
    void stopOwnedProcess("SIGTERM", true);
});
child.once("error", (error) => {
    console.error(`Owned process failed to start: ${errorMessage(error)}`);
    process.exit(1);
});
if (childExitCode !== null || childExitSignal !== null) handleChildExit();
else if (windowsTree === undefined)
    child.once("exit", (code, signal) => {
        cacheChildExit(code, signal);
        handleChildExit();
    });
