/**
 * CHAOS-8538: Playwright reporter that names the requests a timed-out test
 * was still waiting for.
 *
 * A test that ends at its timeout waited for a signal that never came. On
 * 2026-10-03 two CI jobs spent 35 minutes in such timeouts: every signed-in
 * page waited for the browser `load` event while one request (the app-shell
 * logo through `/_next/image`) never got a response. The job log did not
 * name that request; it was only in the trace archives.
 *
 * For each test try with status "timedOut" this reporter reads the network
 * records of the try's trace archive and prints the requests that had no
 * response and no failure, with their age at the end of the try.
 *
 * It only reads files after the try has ended, so it cannot change a test.
 *
 * A measurement that did not happen is printed as "NOT MEASURED" with the
 * reason; it is never silent. The record shape is Playwright-internal:
 * `tests/ci-pending-requests-trace.spec.ts` feeds a trace written by the
 * installed Playwright through the same functions, so a format change fails
 * that test.
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

export type PendingRequest = {
    method: string;
    resourceType: string;
    url: string;
    /** Milliseconds from the request start to the end of the test try. NaN when the record has no start time. */
    ageMs: number;
};

export type TraceNetworkScan = {
    /** `*.network` files given to the scan. */
    networkFiles: number;
    /** `resource-snapshot` records read from them. */
    records: number;
    /** Records with no numeric response status: the record shape is not the one this file knows. */
    unreadable: number;
    /** Requests with no response and no failure, oldest first. */
    pending: PendingRequest[];
};

const PREFIX = "  PENDING at timeout:";
const MAX_LISTED = 10;
const MAX_URL_LENGTH = 300;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const END_RECORD_SIZE = 22;
const MAX_ARCHIVE_COMMENT = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;
const ZIP64_MARKER_16 = 0xffff;

/**
 * Reads the wanted entries of a zip archive. Sizes and offsets come from the
 * central directory, because a streamed entry has zero sizes in its local
 * header.
 */
export function readZipEntries(
    archive: Buffer,
    wanted: (name: string) => boolean,
): Map<string, Buffer> {
    let endRecord = -1;
    const lowestStart = Math.max(0, archive.length - END_RECORD_SIZE - MAX_ARCHIVE_COMMENT);
    for (let offset = archive.length - END_RECORD_SIZE; offset >= lowestStart; offset--) {
        if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
            endRecord = offset;
            break;
        }
    }
    if (endRecord < 0) {
        throw new Error("not a zip archive (no end-of-central-directory record)");
    }

    const entryCount = archive.readUInt16LE(endRecord + 10);
    let cursor = archive.readUInt32LE(endRecord + 16);
    if (entryCount === ZIP64_MARKER_16 || cursor === ZIP64_MARKER_32) {
        throw new Error("zip64 archives are not supported");
    }

    const entries = new Map<string, Buffer>();
    for (let index = 0; index < entryCount; index++) {
        if (archive.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_ENTRY) {
            throw new Error(`corrupt zip central directory at byte ${cursor}`);
        }
        const method = archive.readUInt16LE(cursor + 10);
        const compressedSize = archive.readUInt32LE(cursor + 20);
        const nameLength = archive.readUInt16LE(cursor + 28);
        const extraLength = archive.readUInt16LE(cursor + 30);
        const commentLength = archive.readUInt16LE(cursor + 32);
        const localOffset = archive.readUInt32LE(cursor + 42);
        const name = archive.toString("utf8", cursor + 46, cursor + 46 + nameLength);
        cursor += 46 + nameLength + extraLength + commentLength;
        if (!wanted(name)) continue;

        if (compressedSize === ZIP64_MARKER_32 || localOffset === ZIP64_MARKER_32) {
            throw new Error(`zip entry ${name} uses zip64 sizes, which are not supported`);
        }
        if (archive.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
            throw new Error(`corrupt zip local header for ${name}`);
        }
        const dataStart =
            localOffset +
            30 +
            archive.readUInt16LE(localOffset + 26) +
            archive.readUInt16LE(localOffset + 28);
        const data = archive.subarray(dataStart, dataStart + compressedSize);
        if (method === 0) {
            entries.set(name, Buffer.from(data));
        } else if (method === 8) {
            entries.set(name, inflateRawSync(data));
        } else {
            throw new Error(`zip entry ${name} uses unsupported compression method ${method}`);
        }
    }
    return entries;
}

function field(value: unknown, key: string): unknown {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)[key]
        : undefined;
}

function text(value: unknown, fallback: string): string {
    return typeof value === "string" && value !== "" ? value : fallback;
}

/**
 * Finds the requests with no response in the `*.network` files of a trace.
 *
 * A record is pending when its response status is -1 (no response yet), it
 * has no failure text (a failed or aborted request is finished) and it is not
 * a websocket (an open websocket is not a wait).
 */
export function scanTraceNetwork(
    networkFiles: Map<string, Buffer>,
    testEndMs: number,
): TraceNetworkScan {
    const scan: TraceNetworkScan = {
        networkFiles: networkFiles.size,
        records: 0,
        unreadable: 0,
        pending: [],
    };
    for (const file of networkFiles.values()) {
        for (const line of file.toString("utf8").split("\n")) {
            if (line.trim() === "") continue;
            let record: unknown;
            try {
                record = JSON.parse(line);
            } catch {
                // Not a JSON line. A trace with no readable record at all is
                // reported as NOT MEASURED by formatPendingReport.
                continue;
            }
            if (field(record, "type") !== "resource-snapshot") continue;
            scan.records++;

            const snapshot = field(record, "snapshot");
            const response = field(snapshot, "response");
            const status = field(response, "status");
            if (typeof status !== "number") {
                scan.unreadable++;
                continue;
            }
            const resourceType = text(field(snapshot, "_resourceType"), "unknown");
            if (status !== -1) continue;
            if (field(response, "_failureText")) continue;
            if (resourceType === "websocket") continue;

            const request = field(snapshot, "request");
            const startedAt = Date.parse(text(field(snapshot, "startedDateTime"), ""));
            scan.pending.push({
                method: text(field(request, "method"), "?"),
                resourceType,
                url: text(field(request, "url"), "(no URL in the record)"),
                ageMs: Number.isNaN(startedAt) ? Number.NaN : Math.max(0, testEndMs - startedAt),
            });
        }
    }
    scan.pending.sort((left, right) => {
        if (Number.isNaN(left.ageMs)) return Number.isNaN(right.ageMs) ? 0 : 1;
        if (Number.isNaN(right.ageMs)) return -1;
        return right.ageMs - left.ageMs;
    });
    return scan;
}

function formatAge(ageMs: number): string {
    return Number.isNaN(ageMs) ? "age unknown" : `${(ageMs / 1000).toFixed(1)}s`;
}

function shorten(url: string): string {
    return url.length <= MAX_URL_LENGTH
        ? url
        : `${url.slice(0, MAX_URL_LENGTH)}... (+${url.length - MAX_URL_LENGTH} characters)`;
}

export function formatPendingReport(scan: TraceNetworkScan): string[] {
    if (scan.records === 0) {
        return [
            `${PREFIX} NOT MEASURED: the trace has no network records (${scan.networkFiles} network file(s)). The trace format may have changed.`,
        ];
    }
    const lines: string[] = [];
    if (scan.pending.length === 0) {
        lines.push(
            `${PREFIX} none. ${scan.records - scan.unreadable} request(s) in the trace had a response or a failure.`,
        );
    } else {
        lines.push(
            `${PREFIX} ${scan.pending.length} of ${scan.records} request(s) had no response (age at the end of the try, oldest first):`,
        );
        for (const request of scan.pending.slice(0, MAX_LISTED)) {
            lines.push(
                `    ${formatAge(request.ageMs).padStart(11)}  ${request.method} ${request.resourceType} ${shorten(request.url)}`,
            );
        }
        if (scan.pending.length > MAX_LISTED) {
            lines.push(`    ... and ${scan.pending.length - MAX_LISTED} more`);
        }
    }
    if (scan.unreadable > 0) {
        lines.push(
            `${PREFIX} WARNING: ${scan.unreadable} record(s) had no response status and were not checked. The trace format may have changed.`,
        );
    }
    return lines;
}

/** The report lines for one timed-out try. `readArchive` is a parameter so that a test can plant an archive. */
export function describeTimedOutTry(
    result: Pick<TestResult, "attachments" | "startTime" | "duration">,
    readArchive: (path: string) => Buffer = (path) => readFileSync(path),
): string[] {
    const trace = result.attachments.find(
        (attachment) => attachment.name === "trace" && attachment.path,
    );
    if (!trace?.path) {
        return [
            `${PREFIX} NOT MEASURED: this try has no trace attachment. The "trace" option must keep the trace of a failed test.`,
        ];
    }
    try {
        const networkFiles = readZipEntries(readArchive(trace.path), (name) =>
            name.endsWith(".network"),
        );
        return formatPendingReport(
            scanTraceNetwork(networkFiles, result.startTime.getTime() + result.duration),
        );
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return [`${PREFIX} NOT MEASURED: could not read the trace ${trace.path}: ${reason}`];
    }
}

export default class PendingRequestsReporter implements Reporter {
    onTestEnd(test: TestCase, result: TestResult): void {
        if (result.status !== "timedOut") return;
        const title = test.titlePath().filter(Boolean).join(" › ");
        const retry = result.retry > 0 ? ` (retry #${result.retry})` : "";
        const lines = [`  TIMED OUT: ${title}${retry}`, ...describeTimedOutTry(result)];
        process.stdout.write(`${lines.join("\n")}\n`);
    }
}
