/* eslint-disable @typescript-eslint/no-require-imports */
// TEMPORARY PLANT for the CHAOS-8538 proof run. The next commit removes it.
//
// Preloaded into the web server process (NODE_OPTIONS --require, set in
// playwright.config.ts). A request for the 32 px app-shell logo through the
// image optimizer is never answered: the connection stays open and no byte is
// sent. This is the state of the 2026-10-03 incident, made on purpose.
const http = require("node:http");

const originalEmit = http.Server.prototype.emit;

http.Server.prototype.emit = function emitWithStuckLogo(event, request, ...rest) {
    if (
        event === "request" &&
        typeof request?.url === "string" &&
        request.url.startsWith("/_next/image?") &&
        /[?&]w=32(&|$)/.test(request.url)
    ) {
        process.stderr.write(`[plant] not answering ${request.url}\n`);
        return true;
    }
    return originalEmit.call(this, event, request, ...rest);
};
