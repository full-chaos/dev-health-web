import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Expected a command to supervise");

const child = spawn(command, args, { stdio: "inherit" });
let stopping = false;

function stopOwnedProcess(signal) {
    if (stopping || child.pid === undefined) return;
    stopping = true;
    try {
        child.kill(signal);
    } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return;
        throw error;
    }
    setTimeout(() => process.exit(0), 250).unref();
}

process.once("SIGINT", () => stopOwnedProcess("SIGINT"));
process.once("SIGTERM", () => stopOwnedProcess("SIGTERM"));
child.once("exit", (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
});
