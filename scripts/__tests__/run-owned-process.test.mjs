import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const runner = fileURLToPath(new URL("../run-owned-process.mjs", import.meta.url));
const listener = [
    'const server = require("node:http").createServer();',
    'server.listen(0, "127.0.0.1", () => console.log(server.address().port));',
].join("");

function waitForPort(process) {
    return new Promise((resolve, reject) => {
        let output = "";
        process.stdout.on("data", (chunk) => {
            output += chunk.toString();
            const match = output.match(/\d+/);
            if (match) resolve(Number(match[0]));
        });
        process.once("error", reject);
    });
}

function waitForExit(process) {
    return new Promise((resolve) => process.once("exit", resolve));
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
    it("releases a descendant listener when its exact owned process group stops", async () => {
        const process = spawn("node", [runner, "node", "-e", listener], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        const port = await waitForPort(process);

        process.kill("SIGTERM");
        await waitForExit(process);

        expect(await portIsReleased(port)).toBe(true);
    });
});
