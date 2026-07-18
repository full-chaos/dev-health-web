import { spawn, spawnSync } from "node:child_process";
import { processIdentity } from "./owned-process-posix.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Expected a command for the process-group guardian");

const child = spawn(command, args, { stdio: "inherit", windowsHide: true });
let stopping = false;
let childExit;

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function stop(signal) {
    if (stopping && signal !== "SIGKILL") return;
    stopping = true;
    process.kill(-process.pid, signal);
}

function groupHasDescendants() {
    const result = spawnSync("pgrep", ["-g", String(process.pid)], { encoding: "utf8" });
    if (result.status === 1) return false;
    if (result.status !== 0)
        throw new Error(`Unable to inspect owned process group: ${result.stderr}`);
    return result.stdout
        .split("\n")
        .map((pid) => Number(pid))
        .some((pid) => pid !== process.pid);
}

function groupMemberIdentities() {
    const result = spawnSync("pgrep", ["-g", String(process.pid)], { encoding: "utf8" });
    if (result.status === 1) return [];
    if (result.status !== 0)
        throw new Error(`Unable to inspect owned process group: ${result.stderr}`);
    return result.stdout
        .split("\n")
        .map((pid) => Number(pid))
        .filter((pid) => pid !== process.pid)
        .flatMap((pid) => {
            const identity = processIdentity(pid);
            return identity === undefined ? [] : [identity];
        });
}

function publishLiveMembers() {
    process.send?.({ members: groupMemberIdentities(), type: "members" });
}

function exitWhenGroupIsEmpty() {
    const waitForDescendants = () => {
        publishLiveMembers();
        if (groupHasDescendants()) return;
        process.send?.({ code: childExit.code, signal: childExit.signal, type: "drained" });
        process.exit(childExit.code ?? (childExit.signal ? 1 : 0));
    };
    waitForDescendants();
    setInterval(waitForDescendants, 25);
}

process.on("message", (message) => {
    if (message?.type !== "stop" || typeof message.signal !== "string") return;
    stop(message.signal);
});

setInterval(publishLiveMembers, 25);

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
