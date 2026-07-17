import { spawn } from "node:child_process";
import { OWNED_PROCESS_WAIT_TIMEOUT_MS } from "./owned-process-lifecycle.mjs";
import { processGroupExists } from "./owned-process-posix.mjs";
import { createWindowsOwnedTreeController } from "./owned-process-windows.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Expected a command to supervise");

const SHUTDOWN_TIMEOUT_MS = OWNED_PROCESS_WAIT_TIMEOUT_MS;
const POLL_INTERVAL_MS = 25;
const isWindows = process.platform === "win32";
const windowsTree = isWindows ? createWindowsOwnedTreeController() : undefined;
const child =
    windowsTree === undefined
        ? spawn(command, args, {
              detached: true,
              stdio: "inherit",
              windowsHide: true,
          })
        : await windowsTree.start(command, args);
let stopping = false;
let requestedSignal;
let childExitCode;
let childExitSignal;

function isMissingProcess(error) {
    return error && typeof error === "object" && "code" in error && error.code === "ESRCH";
}

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForProcessGroupExit(pid) {
    const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
    while (processGroupExists(pid)) {
        if (Date.now() >= deadline) return false;
        await wait(POLL_INTERVAL_MS);
    }
    return true;
}

function signalProcessGroup(pid, signal) {
    try {
        process.kill(-pid, signal);
    } catch (error) {
        if (!isMissingProcess(error)) throw error;
    }
}

async function stopOwnedTree(signal) {
    if (child.pid === undefined) throw new Error("Owned process did not expose a PID.");

    if (windowsTree !== undefined) {
        await windowsTree.stop();
        return;
    }

    signalProcessGroup(child.pid, signal);
    if (await waitForProcessGroupExit(child.pid)) return;

    signalProcessGroup(child.pid, "SIGKILL");
    if (!(await waitForProcessGroupExit(child.pid))) {
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
child.once("exit", (code, signal) => {
    childExitCode = code;
    childExitSignal = signal;
    void stopOwnedProcess("SIGTERM", false);
});
