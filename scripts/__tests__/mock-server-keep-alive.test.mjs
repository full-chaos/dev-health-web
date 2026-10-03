import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { MOCK_KEEP_ALIVE_MS, hardenMockServer } from "../../tests/mocks/serverSockets.ts";

// CHAOS-8555: the e2e mocks closed idle keep-alive sockets after Node's default 5 s (+1 s buffer),
// so a re-used socket got `read ECONNRESET` / `socket hang up`.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("e2e mock servers keep idle sockets open", () => {
    it("both mocks wrap their listening server in hardenMockServer", () => {
        for (const [file, name] of [
            ["tests/mocks/http-server.ts", "ops-8012"],
            ["tests/mocks/acr-server.ts", "acr-8013"],
        ]) {
            const src = read(file);
            expect(src, file).toContain("hardenMockServer(");
            expect(src, file).toContain(`"${name}"`);
        }
    });

    it("the helper lifts keepAliveTimeout far above the idle time of a suite and headersTimeout above it", () => {
        const server = hardenMockServer(http.createServer(), "t");
        expect(MOCK_KEEP_ALIVE_MS).toBeGreaterThanOrEqual(60_000);
        expect(server.keepAliveTimeout).toBe(MOCK_KEEP_ALIVE_MS);
        expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
    });

    it("a socket idle past the Node default (5 s + 1 s buffer) is still answered", async () => {
        const server = hardenMockServer(
            http.createServer((_q, r) => r.end("ok")),
            "t",
        );
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const port = server.address().port;
        const sock = net.connect(port, "127.0.0.1");
        const req = "GET / HTTP/1.1\r\nHost: x\r\n\r\n";
        let answers = 0;
        sock.on("data", () => (answers += 1));
        await new Promise((r) => sock.once("connect", r));
        sock.write(req);
        await new Promise((r) => setTimeout(r, 6_300));
        sock.write(req);
        await new Promise((r) => setTimeout(r, 300));
        sock.destroy();
        server.close();
        expect(answers).toBe(2);
    }, 15_000);

    it("a dropped client connection is logged with the mock's name", async () => {
        const server = hardenMockServer(http.createServer(), "named-mock");
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        const sock = net.connect(server.address().port, "127.0.0.1");
        await new Promise((r) => sock.once("connect", r));
        sock.write("NOT HTTP AT ALL\r\n\r\n");
        await new Promise((r) => setTimeout(r, 200));
        sock.destroy();
        server.close();
        const lines = spy.mock.calls.map((c) => String(c[0]));
        spy.mockRestore();
        expect(lines.some((l) => l.startsWith("[mock:named-mock] client connection dropped"))).toBe(
            true,
        );
    });
});
