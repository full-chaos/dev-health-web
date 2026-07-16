import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

describe("run-owned-process", () => {
    it("releases an exact owned grandchild listener when its process group stops", async () => {
        const tree = spawn("node", [runner, "node", "-e", grandchildListener], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        const listenerProcess = await waitForListener(tree);

        tree.kill("SIGTERM");
        await waitForExit(tree);

        expect(await portIsReleased(listenerProcess.port)).toBe(true);
        expect(() => process.kill(listenerProcess.pid, 0)).toThrow();
    });
});
