import type { Server } from "node:http";

// CHAOS-8555: Node closes an idle keep-alive socket after `keepAliveTimeout` (5 s by default, plus
// a 1 s buffer). The BFF proxy and Playwright re-use sockets, and a test that idles a few seconds
// writes its next request onto a socket the mock just closed: `read ECONNRESET` or `socket hang
// up`. A mock is a test server; it keeps its sockets open longer than any idle time in the suite.
export const MOCK_KEEP_ALIVE_MS = 120_000;

export function hardenMockServer(server: Server, name: string): Server {
    server.keepAliveTimeout = MOCK_KEEP_ALIVE_MS;
    // Node needs headersTimeout above keepAliveTimeout, else the headers timer closes the socket first.
    server.headersTimeout = MOCK_KEEP_ALIVE_MS + 5_000;
    // A dropped connection must name the mock and the request, not only the client's reset.
    server.on("clientError", (error, socket) => {
        console.error(`[mock:${name}] client connection dropped: ${error.message}`);
        if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
        else socket.destroy();
    });
    server.on("connection", (socket) => {
        socket.on("error", (error) => {
            console.error(`[mock:${name}] socket error: ${error.message}`);
        });
        socket.on("close", (hadError) => {
            if (hadError) console.error(`[mock:${name}] socket closed after an error`);
        });
    });
    return server;
}
