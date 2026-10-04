import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import {
    describeTimedOutTry,
    readZipEntries,
    scanTraceNetwork,
} from "../ci/playwright-pending-requests";

// CHAOS-8538: the pending-requests reporter (ci/playwright-pending-requests.ts)
// reads the network records of a trace archive. That record shape is internal
// to Playwright. This test makes the installed Playwright write a trace of a
// page with one request that never gets a response, and reads it with the same
// functions the reporter uses. A change of the trace format fails here, and
// not as a silent empty report on the next timeout.

// The runner must not own tracing in this file: the test records its own trace
// so that it can read the archive.
test.use({ trace: "off" });

const PAGE_HTML =
    '<!doctype html><title>pending request</title><img src="/stuck.png" alt=""><script>fetch("/answered.txt")</script>';

test("a trace of the installed Playwright names the request with no response", async ({
    browser,
}, testInfo) => {
    const server = createServer((request, response) => {
        if (request.url === "/stuck.png") {
            // The planted defect: the connection stays open and no byte is sent.
            return;
        }
        if (request.url === "/page.html") {
            response.writeHead(200, { "content-type": "text/html" });
            response.end(PAGE_HTML);
            return;
        }
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const tracePath = testInfo.outputPath("pending-request-trace.zip");
    const context = await browser.newContext();
    const startTime = new Date();

    try {
        // `snapshots: true` is what turns the network record on, as in the
        // runner's own "retain-on-failure" trace.
        await context.tracing.start({ snapshots: true, screenshots: false });
        const page = await context.newPage();
        const stuckRequest = page.waitForRequest(`${origin}/stuck.png`);
        const answeredResponse = page.waitForResponse(`${origin}/answered.txt`);
        await page.goto(`${origin}/page.html`, { waitUntil: "domcontentloaded" });
        await stuckRequest;
        await (await answeredResponse).finished();
        // Give the stuck request a measurable age.
        await new Promise((resolve) => setTimeout(resolve, 300));
        await context.tracing.stop({ path: tracePath });
    } finally {
        await context.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }

    const networkFiles = readZipEntries(readFileSync(tracePath), (name) =>
        name.endsWith(".network"),
    );
    const scan = scanTraceNetwork(networkFiles, Date.now());

    expect(networkFiles.size, "the trace archive has no *.network file").toBeGreaterThan(0);
    expect(scan.unreadable).toBe(0);
    expect(scan.records).toBeGreaterThanOrEqual(3);
    expect(scan.pending.map((request) => request.url)).toEqual([`${origin}/stuck.png`]);
    expect(scan.pending[0].ageMs).toBeGreaterThanOrEqual(250);

    // The reporter's own entry point, with the archive as the trace attachment
    // of a try: the lines it would print for a timed-out try.
    const report = describeTimedOutTry({
        attachments: [{ name: "trace", contentType: "application/zip", path: tracePath }],
        startTime,
        duration: Date.now() - startTime.getTime(),
    }).join("\n");
    expect(report).toContain("PENDING at timeout: 1 of ");
    expect(report).toContain(`GET image ${origin}/stuck.png`);
    expect(report).not.toContain("NOT MEASURED");
});
