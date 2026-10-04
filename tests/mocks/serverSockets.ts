import type { Server } from "node:http";

// CHAOS-8555: Node closes an idle keep-alive socket after `keepAliveTimeout` (5 s by default, plus
// a 1 s buffer). The BFF proxy keeps sockets for the whole job and a test that idles a few seconds
// writes its next request onto a socket the mock just closed: `read ECONNRESET` or `socket hang
// up`. A mock is a test server: it never closes an idle socket. Node documents `0` as "disable the
// keep-alive timeout on incoming connections"; the launcher kills the process at teardown.
export const MOCK_KEEP_ALIVE_MS = 0;

export function hardenMockServer(server: Server, name: string): Server {
    server.keepAliveTimeout = MOCK_KEEP_ALIVE_MS;
    // A dropped connection must name the mock and the request, not only the client's reset.
    server.on("clientError", (error, socket) => {
        console.error(`[mock:${name}] client connection dropped: ${error.message}`);
        if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
        else socket.destroy();
    });
    const inFlight = new WeakMap<object, string>();
    server.on("request", (req) => {
        inFlight.set(req.socket, `${req.method} ${req.url}`);
    });
    server.on("connection", (socket) => {
        socket.on("error", (error) => {
            console.error(
                `[mock:${name}] socket error on ${inFlight.get(socket) ?? "no request yet"}: ${error.message}`,
            );
        });
        socket.on("close", (hadError) => {
            if (hadError) {
                console.error(
                    `[mock:${name}] socket closed after an error, last request ${inFlight.get(socket) ?? "none"}`,
                );
            }
        });
    });
    return server;
}
