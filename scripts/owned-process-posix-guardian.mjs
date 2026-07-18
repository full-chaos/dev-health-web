import { spawn, spawnSync } from "node:child_process";
import { processIdentity } from "./owned-process-posix.mjs";
import { groupHasDescendants, groupMemberIdentities } from "./owned-process-posix-group.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Expected a command for the process-group guardian");

const child = spawn(command, args, { stdio: "inherit", windowsHide: true });
let stopping = false;
let childExit;
let memberPoll;
let drainPoll;

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function stop(signal) {
    if (stopping && signal !== "SIGKILL") return;
    stopping = true;
    process.kill(-process.pid, signal);
}

function publishLiveMembers() {
    process.send?.({
        members: groupMemberIdentities(process.pid, process.pid, spawnSync, processIdentity),
        type: "members",
    });
}

function stopPolling() {
    if (memberPoll !== undefined) clearInterval(memberPoll);
    if (drainPoll !== undefined) clearInterval(drainPoll);
}

function publishDrained(message) {
    if (typeof process.send !== "function" || !process.connected) return;
    try {
        process.send(message, () => {
            if (process.connected) process.disconnect();
        });
    } catch {
        if (process.connected) process.disconnect();
    }
}

function exitWhenGroupIsEmpty() {
    const waitForDescendants = () => {
        publishLiveMembers();
        if (groupHasDescendants(process.pid, process.pid, spawnSync)) return;
        stopPolling();
        process.exitCode = childExit.code ?? (childExit.signal ? 1 : 0);
        publishDrained({ code: childExit.code, signal: childExit.signal, type: "drained" });
    };
    drainPoll = setInterval(waitForDescendants, 25);
    waitForDescendants();
}

process.on("message", (message) => {
    if (message?.type !== "stop" || typeof message.signal !== "string") return;
    stop(message.signal);
});

memberPoll = setInterval(publishLiveMembers, 25);

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        if (!stopping) stop(signal);
    });
}

child.once("error", (error) => {
    process.send?.({ type: "error", message: errorMessage(error) });
    process.exit(1);
});
child.once("exit", (code, signal) => {
    childExit = { code, signal };
    exitWhenGroupIsEmpty();
});

const target = processIdentity(child.pid);
process.send?.({ guardianPid: process.pid, target, type: "ready" });
publishLiveMembers();
