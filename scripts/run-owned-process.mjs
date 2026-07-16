import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Expected a command to supervise");

const SHUTDOWN_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 25;
const isWindows = process.platform === "win32";
const child = spawn(command, args, {
    detached: !isWindows,
    stdio: "inherit",
    windowsHide: true,
});
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

function processGroupExists(pid) {
    try {
        process.kill(-pid, 0);
        return true;
    } catch (error) {
        if (isMissingProcess(error)) return false;
        throw error;
    }
}

async function waitForProcessGroupExit(pid) {
    const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
    while (processGroupExists(pid)) {
        if (Date.now() >= deadline) return false;
        await wait(POLL_INTERVAL_MS);
    }
    return true;
}

function runTaskkill(pid) {
    return new Promise((resolve, reject) => {
        const taskkill = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
        });
        taskkill.once("error", reject);
        taskkill.once("close", (code) => {
            if (code === 0 || isMissingProcessForWindows(pid)) {
                resolve();
                return;
            }
            reject(new Error(`taskkill exited with status ${code ?? "unknown"}.`));
        });
    });
}

function isMissingProcessForWindows(pid) {
    try {
        process.kill(pid, 0);
        return false;
    } catch (error) {
        if (isMissingProcess(error)) return true;
        throw error;
    }
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

    if (isWindows) {
        await runTaskkill(child.pid);
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
