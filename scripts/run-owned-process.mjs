import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { OWNED_PROCESS_WAIT_TIMEOUT_MS } from "./owned-process-lifecycle.mjs";
import { selectOwnedTreeController } from "./owned-process-controller.mjs";
import { createGuardianCompletionCoordinator } from "./owned-process-guardian-completion.mjs";
import {
    processGroupExists,
    processGroupIsOwned,
    waitForProcessGroupGone,
} from "./owned-process-posix.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Expected a command to supervise");

const SHUTDOWN_TIMEOUT_MS = OWNED_PROCESS_WAIT_TIMEOUT_MS;
const POLL_INTERVAL_MS = 25;
const isWindows = process.platform === "win32";
const posixGuardian = fileURLToPath(new URL("./owned-process-posix-guardian.mjs", import.meta.url));
let child;
let stopping = false;
let requestedSignal;
const ownedGroupMembers = new Map();
// Test seam (run-owned-process.test.mjs): report the group as still alive for this many extra polls
// after it is really gone, so a test can show the supervisor waits for the group (CHAOS-8457).
let extraAlivePolls = Number(process.env.OWNED_PROCESS_TEST_GROUP_ALIVE_POLLS ?? 0) || 0;
function groupExistsForCleanup(groupId) {
    if (extraAlivePolls > 0) {
        extraAlivePolls -= 1;
        return true;
    }
    return processGroupExists(groupId);
}
const guardianCompletion = createGuardianCompletionCoordinator();

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
    guardianCompletion.completeFromExitEvent(code, signal);
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
if (windowsTree === undefined) {
    child.on("message", (message) => {
        if (message?.type === "ready") retainOwnedGroupMember(message.target);
        if (message?.type === "members" && Array.isArray(message.members))
            message.members.forEach(retainOwnedGroupMember);
        if (guardianCompletion.completeFromDrainedMessage(message) && !stopping)
            process.exit(exitCodeAfterCleanup());
    });
    child.once("exit", (code, signal) => {
        guardianCompletion.completeFromExitEvent(code, signal);
        handleChildExit();
    });
}

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function waitForGuardianDrain() {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve(undefined);
        }, SHUTDOWN_TIMEOUT_MS);
        guardianCompletion.wait().then((source) => {
            clearTimeout(timeout);
            resolve(source);
        });
    });
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
        await waitForProcessGroupGone(child.pid, {
            deadlineMs: SHUTDOWN_TIMEOUT_MS,
            pollIntervalMs: POLL_INTERVAL_MS,
        });
        return;
    }

    child.send({ signal, type: "stop" });
    const drainSource = await waitForGuardianDrain();
    if (drainSource !== undefined) return;

    child.send({ signal: "SIGKILL", type: "stop" });
    const killSource = await waitForGuardianDrain();
    if (killSource === undefined) {
        throw new Error("Owned process group remained alive after SIGKILL.");
    }
    if (killSource === "exit_event") {
        // The guardian kills its own group, itself included, so after SIGKILL it can never announce
        // "drained": its death is the only signal. Its death does not prove the other members are
        // gone (their teardown can lag), so check the group before the supervisor exits.
        console.error(
            "owned-process: the guardian exited before announcing drain; verifying the owned group is gone",
        );
        const polls = await waitForProcessGroupGone(child.pid, {
            deadlineMs: SHUTDOWN_TIMEOUT_MS,
            exists: groupExistsForCleanup,
            pollIntervalMs: POLL_INTERVAL_MS,
        });
        console.error(
            `owned-process: the owned group is gone (it was still there for ${polls} polls)`,
        );
    }
}

function exitCodeAfterCleanup() {
    if (requestedSignal !== undefined) return 0;
    const { code, signal } = guardianCompletion.terminalResult();
    return code ?? (signal ? 1 : 0);
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
if (child.exitCode !== null || child.signalCode !== null) {
    guardianCompletion.completeFromExitEvent(child.exitCode, child.signalCode);
    handleChildExit();
}
