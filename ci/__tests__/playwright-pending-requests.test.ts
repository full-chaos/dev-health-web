import { deflateRawSync } from "node:zlib";
import type { TestCase, TestResult } from "@playwright/test/reporter";
import { afterEach, describe, expect, it, vi } from "vitest";
import PendingRequestsReporter, {
    describeTimedOutTry,
    formatPendingReport,
    readZipEntries,
    scanTraceNetwork,
} from "../playwright-pending-requests";

// These tests plant each state the reporter exists to name. The archive and
// the records are built here by hand; the proof against a trace written by the
// installed Playwright is tests/ci-pending-requests-trace.spec.ts, which runs
// in the e2e job.

const LOGO_URL =
    "http://127.0.0.1:3001/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ffc-logo.2ll0i5fz-krbk.png&w=32&q=75";
const TRY_START = new Date("2026-10-03T20:23:43.800Z");
const TRY_DURATION_MS = 31_200;
const TRY_END_MS = TRY_START.getTime() + TRY_DURATION_MS;

type ZipInput = { name: string; data: Buffer; method?: 0 | 8; streamed?: boolean };

/** A minimal zip writer. `streamed` writes zero sizes in the local header, as a streamed entry has. */
function buildZip(inputs: ZipInput[]): Buffer {
    const fileParts: Buffer[] = [];
    const directoryParts: Buffer[] = [];
    let offset = 0;
    for (const input of inputs) {
        const name = Buffer.from(input.name, "utf8");
        const method = input.method ?? 8;
        const body = method === 8 ? deflateRawSync(input.data) : input.data;
        const flags = input.streamed ? 0x0008 : 0;

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(flags, 6);
        local.writeUInt16LE(method, 8);
        local.writeUInt32LE(input.streamed ? 0 : body.length, 18);
        local.writeUInt32LE(input.streamed ? 0 : input.data.length, 22);
        local.writeUInt16LE(name.length, 26);
        const descriptor = input.streamed ? Buffer.alloc(16) : Buffer.alloc(0);

        const directory = Buffer.alloc(46);
        directory.writeUInt32LE(0x02014b50, 0);
        directory.writeUInt16LE(20, 4);
        directory.writeUInt16LE(20, 6);
        directory.writeUInt16LE(flags, 8);
        directory.writeUInt16LE(method, 10);
        directory.writeUInt32LE(body.length, 20);
        directory.writeUInt32LE(input.data.length, 24);
        directory.writeUInt16LE(name.length, 28);
        directory.writeUInt32LE(offset, 42);

        fileParts.push(local, name, body, descriptor);
        directoryParts.push(directory, name);
        offset += local.length + name.length + body.length + descriptor.length;
    }
    const centralDirectory = Buffer.concat(directoryParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(inputs.length, 8);
    end.writeUInt16LE(inputs.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...fileParts, centralDirectory, end]);
}

type RecordInput = {
    url: string;
    status: number;
    startedDateTime: string;
    resourceType?: string;
    method?: string;
    failureText?: string;
};

/** One trace network line, in the shape Playwright 1.62.1 wrote in the CHAOS-8538 traces. */
function networkLine(input: RecordInput): string {
    return JSON.stringify({
        type: "resource-snapshot",
        snapshot: {
            startedDateTime: input.startedDateTime,
            time: input.status === -1 ? -1 : 12,
            request: { method: input.method ?? "GET", url: input.url, headers: [] },
            response: {
                status: input.status,
                headers: [],
                ...(input.failureText ? { _failureText: input.failureText } : {}),
            },
            _resourceType: input.resourceType ?? "fetch",
        },
    });
}

function networkFiles(lines: string[]): Map<string, Buffer> {
    return new Map([["0-trace.network", Buffer.from(lines.join("\n"), "utf8")]]);
}

const INCIDENT_LINES = [
    networkLine({
        url: "http://127.0.0.1:3001/demo",
        status: 200,
        startedDateTime: "2026-10-03T20:23:43.815Z",
        resourceType: "document",
    }),
    "",
    JSON.stringify({ type: "context-options", browserName: "chromium" }),
    networkLine({
        url: "http://127.0.0.1:3001/api/auth/session",
        status: -1,
        startedDateTime: "2026-10-03T20:24:14.500Z",
    }),
    networkLine({
        url: LOGO_URL,
        status: -1,
        startedDateTime: "2026-10-03T20:23:45.536Z",
        resourceType: "image",
    }),
    networkLine({
        url: "http://127.0.0.1:3001/api/aborted",
        status: -1,
        startedDateTime: "2026-10-03T20:23:46.000Z",
        failureText: "net::ERR_ABORTED",
    }),
    networkLine({
        url: "http://127.0.0.1:3001/_next/hmr",
        status: -1,
        startedDateTime: "2026-10-03T20:23:46.202Z",
        resourceType: "websocket",
    }),
];

function timedOutTry(attachments: TestResult["attachments"]) {
    return { attachments, startTime: TRY_START, duration: TRY_DURATION_MS };
}

describe("scanTraceNetwork", () => {
    it("names each request with no response and its age, oldest first", () => {
        const scan = scanTraceNetwork(networkFiles(INCIDENT_LINES), TRY_END_MS);

        expect(scan.pending).toEqual([
            { method: "GET", resourceType: "image", url: LOGO_URL, ageMs: 29_464 },
            {
                method: "GET",
                resourceType: "fetch",
                url: "http://127.0.0.1:3001/api/auth/session",
                ageMs: 500,
            },
        ]);
        expect(scan.records).toBe(5);
        expect(scan.networkFiles).toBe(1);
        expect(scan.unreadable).toBe(0);
    });

    it("does not list an answered request, a failed request or a websocket", () => {
        const urls = scanTraceNetwork(networkFiles(INCIDENT_LINES), TRY_END_MS).pending.map(
            (request) => request.url,
        );

        expect(urls).not.toContain("http://127.0.0.1:3001/demo");
        expect(urls).not.toContain("http://127.0.0.1:3001/api/aborted");
        expect(urls).not.toContain("http://127.0.0.1:3001/_next/hmr");
    });

    it("counts a record with no response status as unreadable and does not call it answered", () => {
        const scan = scanTraceNetwork(
            networkFiles([
                JSON.stringify({ type: "resource-snapshot", snapshot: { request: { url: "x" } } }),
            ]),
            TRY_END_MS,
        );

        expect(scan).toMatchObject({ records: 1, unreadable: 1, pending: [] });
    });

    it("keeps a pending request whose start time is not readable", () => {
        const scan = scanTraceNetwork(
            networkFiles([networkLine({ url: LOGO_URL, status: -1, startedDateTime: "" })]),
            TRY_END_MS,
        );

        expect(scan.pending).toHaveLength(1);
        expect(scan.pending[0].ageMs).toBeNaN();
    });
});

describe("formatPendingReport", () => {
    it("prints the age, the method, the type and the URL of each pending request", () => {
        const lines = formatPendingReport(
            scanTraceNetwork(networkFiles(INCIDENT_LINES), TRY_END_MS),
        );

        expect(lines[0]).toBe(
            "  PENDING at timeout: 2 of 5 request(s) had no response (age at the end of the try, oldest first):",
        );
        expect(lines[1]).toBe(`          29.5s  GET image ${LOGO_URL}`);
        expect(lines[2]).toBe("           0.5s  GET fetch http://127.0.0.1:3001/api/auth/session");
        expect(lines).toHaveLength(3);
    });

    it("says NOT MEASURED when the trace has no network record", () => {
        expect(formatPendingReport(scanTraceNetwork(new Map(), TRY_END_MS))).toEqual([
            "  PENDING at timeout: NOT MEASURED: the trace has no network records (0 network file(s)). The trace format may have changed.",
        ]);
        expect(
            formatPendingReport(scanTraceNetwork(networkFiles(["not json"]), TRY_END_MS))[0],
        ).toContain("NOT MEASURED");
    });

    it("says none when each request had a response", () => {
        const lines = formatPendingReport(
            scanTraceNetwork(networkFiles([INCIDENT_LINES[0]]), TRY_END_MS),
        );

        expect(lines).toEqual([
            "  PENDING at timeout: none. 1 request(s) in the trace had a response or a failure.",
        ]);
    });

    it("warns when a record has no response status", () => {
        const lines = formatPendingReport(
            scanTraceNetwork(
                networkFiles([
                    INCIDENT_LINES[0],
                    JSON.stringify({ type: "resource-snapshot", snapshot: {} }),
                ]),
                TRY_END_MS,
            ),
        );

        expect(lines[1]).toContain("WARNING: 1 record(s) had no response status");
    });

    it("lists ten requests at most and shortens a long URL", () => {
        const longUrl = `http://127.0.0.1:3001/operating-review?f=${"a".repeat(400)}`;
        const lines = formatPendingReport(
            scanTraceNetwork(
                networkFiles(
                    Array.from({ length: 12 }, () =>
                        networkLine({
                            url: longUrl,
                            status: -1,
                            startedDateTime: "2026-10-03T20:24:00.000Z",
                        }),
                    ),
                ),
                TRY_END_MS,
            ),
        );

        expect(lines).toHaveLength(12);
        expect(lines[1]).toContain(
            `${longUrl.slice(0, 300)}... (+${longUrl.length - 300} characters)`,
        );
        expect(lines[11]).toBe("    ... and 2 more");
    });
});

describe("readZipEntries", () => {
    it("reads deflated, stored and streamed entries and leaves out the others", () => {
        const archive = buildZip([
            { name: "test.trace", data: Buffer.from("not wanted") },
            { name: "0-trace.network", data: Buffer.from("deflated") },
            { name: "1-trace.network", data: Buffer.from("stored"), method: 0 },
            { name: "2-trace.network", data: Buffer.from("streamed"), streamed: true },
        ]);

        const entries = readZipEntries(archive, (name) => name.endsWith(".network"));

        expect([...entries.keys()]).toEqual([
            "0-trace.network",
            "1-trace.network",
            "2-trace.network",
        ]);
        expect(entries.get("0-trace.network")?.toString()).toBe("deflated");
        expect(entries.get("1-trace.network")?.toString()).toBe("stored");
        expect(entries.get("2-trace.network")?.toString()).toBe("streamed");
    });

    it("throws on bytes that are not a zip archive", () => {
        expect(() =>
            readZipEntries(Buffer.from("plain text, long enough to scan"), () => true),
        ).toThrow("not a zip archive");
        expect(() => readZipEntries(Buffer.alloc(0), () => true)).toThrow("not a zip archive");
    });
});

describe("describeTimedOutTry", () => {
    const trace = { name: "trace", contentType: "application/zip", path: "/results/trace.zip" };

    it("names the stuck request from the trace attachment of the try", () => {
        const archive = buildZip([
            {
                name: "0-trace.network",
                data: Buffer.from(INCIDENT_LINES.join("\n")),
                streamed: true,
            },
        ]);
        const read = vi.fn(() => archive);

        const lines = describeTimedOutTry(timedOutTry([trace]), read);

        expect(read).toHaveBeenCalledWith("/results/trace.zip");
        expect(lines.join("\n")).toContain(`29.5s  GET image ${LOGO_URL}`);
    });

    it("says NOT MEASURED when the try has no trace attachment", () => {
        const screenshot = { name: "screenshot", contentType: "image/png", path: "/results/a.png" };

        expect(describeTimedOutTry(timedOutTry([screenshot]))).toEqual([
            '  PENDING at timeout: NOT MEASURED: this try has no trace attachment. The "trace" option must keep the trace of a failed test.',
        ]);
    });

    it("says NOT MEASURED with the reason when the trace cannot be read", () => {
        const lines = describeTimedOutTry(timedOutTry([trace]), () => {
            throw new Error("ENOENT: no such file");
        });

        expect(lines).toEqual([
            "  PENDING at timeout: NOT MEASURED: could not read the trace /results/trace.zip: ENOENT: no such file",
        ]);
    });
});

describe("PendingRequestsReporter", () => {
    const heatmap = {
        titlePath: () => [
            "",
            "authenticated",
            "tests/heatmap.spec.ts",
            "heatmap renders and shows tooltip",
        ],
    } as unknown as TestCase;

    function tryWithStatus(status: TestResult["status"], retry: number): TestResult {
        return { ...timedOutTry([]), status, retry } as unknown as TestResult;
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("prints the test and the pending report for a timed-out try", () => {
        const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

        new PendingRequestsReporter().onTestEnd(heatmap, tryWithStatus("timedOut", 1));

        expect(write).toHaveBeenCalledTimes(1);
        const printed = String(write.mock.calls[0][0]);
        expect(printed).toContain(
            "  TIMED OUT: authenticated › tests/heatmap.spec.ts › heatmap renders and shows tooltip (retry #1)\n",
        );
        expect(printed).toContain(
            "PENDING at timeout: NOT MEASURED: this try has no trace attachment",
        );
    });

    it("prints nothing for a try that did not time out", () => {
        const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        const reporter = new PendingRequestsReporter();

        reporter.onTestEnd(heatmap, tryWithStatus("passed", 0));
        reporter.onTestEnd(heatmap, tryWithStatus("failed", 0));
        reporter.onTestEnd(heatmap, tryWithStatus("skipped", 0));

        expect(write).not.toHaveBeenCalled();
    });
});
