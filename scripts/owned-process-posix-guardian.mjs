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

function exitWhenGroupIsEmpty() {
    const waitForDescendants = () => {
        if (groupHasDescendants()) return;
        process.send?.({ type: "drained" });
        process.exit(childExit.code ?? (childExit.signal ? 1 : 0));
    };
    waitForDescendants();
    setInterval(waitForDescendants, 25);
}

process.on("message", (message) => {
    if (message?.type !== "stop" || typeof message.signal !== "string") return;
    stop(message.signal);
});

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

process.send?.({ guardianPid: process.pid, target: processIdentity(child.pid), type: "ready" });
