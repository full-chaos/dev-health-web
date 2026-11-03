import { spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { E2E_PORT_ENV } from "../e2e-ports.mjs";
import { pickFreePorts } from "../pick-e2e-ports.mjs";

const SCRIPT = path.resolve(__dirname, "../pick-e2e-ports.mjs");

function listen(port = 0): Promise<net.Server> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve(server));
    });
}

describe("pickFreePorts", () => {
    it("returns distinct ports inside the range", async () => {
        const ports = await pickFreePorts(11, { min: 20000, max: 29999 });
        expect(new Set(ports).size).toBe(11);
        for (const port of ports) {
            expect(port).toBeGreaterThanOrEqual(20000);
            expect(port).toBeLessThanOrEqual(29999);
        }
    });

    it("never returns a port that is bound", async () => {
        const held = await listen();
        const heldPort = (held.address() as net.AddressInfo).port;
        try {
            // A range of two ports: one is held, so every pick must be the other one.
            const range = { min: heldPort, max: heldPort + 1 };
            for (let attempt = 0; attempt < 20; attempt += 1) {
                const [port] = await pickFreePorts(1, range);
                expect(port).toBe(heldPort + 1);
            }
        } finally {
            held.close();
        }
    });

    it("two picks in a row skip ports a live server holds", async () => {
        const first = await pickFreePorts(3, { min: 20000, max: 29999 });
        const servers = await Promise.all(first.map((port) => listen(port)));
        try {
            const second = await pickFreePorts(3, { min: 20000, max: 29999 });
            for (const port of second) expect(first).not.toContain(port);
        } finally {
            for (const server of servers) server.close();
        }
    });

    it("fails when the range has too few free ports", async () => {
        const held = await listen();
        const heldPort = (held.address() as net.AddressInfo).port;
        try {
            await expect(pickFreePorts(1, { min: heldPort, max: heldPort })).rejects.toThrow(
                /free port/,
            );
        } finally {
            held.close();
        }
    });
});

describe("pick-e2e-ports.mjs command line", () => {
    it("prints one export line per env var with a distinct port", () => {
        const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
        expect(result.status).toBe(0);
        const lines = result.stdout.trim().split("\n");
        const names = Object.values(E2E_PORT_ENV);
        expect(lines).toHaveLength(names.length);
        const ports = lines.map((line, index) => {
            const match = /^export ([A-Z_]+)=(\d+)$/u.exec(line);
            expect(match?.[1]).toBe(names[index]);
            return match?.[2];
        });
        expect(new Set(ports).size).toBe(names.length);
    });
});
