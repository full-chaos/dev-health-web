import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";

/**
 * CHAOS-12199: a forwarding proxy between the browser and the real ACR, for the terminals the
 * browser transport decides itself. A healthy ACR never stalls, holds its headers, breaks its
 * grammar or cuts a stream, so the proxy does it, one fault per proxy.
 *
 * The browser reaches it through `route.continue({ url })`. Playwright allows that only to the same
 * scheme (`playwright-core` types: "New URL must have same protocol as original one"), so the proxy
 * listens with ACR's scheme: `http`, or `https` with a throwaway self-signed certificate that the
 * live project's `ignoreHTTPSErrors` accepts.
 *
 * It forwards the method, the headers (only `Host` is set to ACR's) and the body unchanged, and
 * streams ACR's answer back unchanged except for its fault. It records statuses, ACR's
 * `X-Request-ID`, what the fault did and when. It never logs, and never keeps a header value other
 * than that id, a token or a body.
 */

export type FaultMode =
    /** Forward to the end of the first `accepted` frame, then nothing more; the socket stays open. */
    | "hold-after-accepted"
    /** Send ACR's response headers 16 s after the request came, the upstream request already sent. */
    | "hold-headers"
    /** Change `seq` in the second frame's `data` from 2 to 9; pass the rest. */
    | "corrupt-second-frame"
    /** Forward until the first `result` or `error` frame, then end the response and drop ACR. */
    | "cut-before-terminal"
    /** Forward through the end of the first `stage` frame, then end the response and drop ACR. */
    | "cut-after-first-stage"
    /** Answer the first request 401 at once, with no body, and send nothing to ACR. */
    | "unauthorized-once"
    /**
     * Forward through the end of the first `accepted` frame, then end the browser's response, and
     * read ACR's stream to its end: ACR sees no drop, so its run goes on (CHAOS-12192).
     */
    | "end-after-accepted-keep-acr";

/** One request through the proxy. Times are milliseconds from `receivedAt`. */
export type ProxyExchange = {
    readonly method: string;
    readonly path: string;
    /** Epoch ms, on the test runner's clock. */
    readonly receivedAt: number;
    /** ACR's status; null when ACR did not answer, or the proxy answered itself. */
    acrStatus: number | null;
    /** ACR's `X-Request-ID`: its `request_id` for this call. */
    acrRequestId: string | null;
    /** The status the browser got; null when the proxy sent it no headers. */
    browserStatus: number | null;
    /** What the fault did, in the proxy's words. Never wire content. */
    fault: string;
    /** Whether the fault happened on this request. */
    faulted: boolean;
    /** An error code on the way to ACR (`ECONNREFUSED`, for example). */
    upstreamError: string | null;
    /** The `reserved_result_id` of ACR's `accepted` frame: an id, never content. */
    reservedResultId: string | null;
    /** The terminal ACR's stream ended with (`result` or `error`), as the proxy read it. */
    acrTerminal: string | null;
    readonly at: {
        acrHeaders?: number;
        accepted?: number;
        fault?: number;
        /** The browser closed its connection while the response was still open. */
        browserGone?: number;
        /** The proxy ended the browser's response. */
        ended?: number;
    };
};

export type FaultProxy = {
    /** The proxy's origin, with ACR's scheme. */
    readonly origin: string;
    readonly mode: FaultMode;
    readonly exchanges: readonly ProxyExchange[];
    /** A copy of the record, for a report. */
    readonly record: () => ProxyExchange[];
    readonly close: () => Promise<void>;
};

/** How long `hold-headers` holds them: past the browser's 15 s header wait. */
export const HOLD_HEADERS_MS = 16_000;

/** ACR's CORS answer (acr `internal/api/cors.go`), for the 401 the proxy writes itself. */
const EXPOSE_HEADERS = "Retry-After, X-Request-ID";

const BOUNDARY = /\r\n\r\n|\n\n|\r\r/u;

type Frame = { readonly text: string; readonly event: string | undefined; readonly data: boolean };

function frameOf(text: string): Frame {
    let event: string | undefined;
    let data = false;
    for (const line of text.split(/\r\n|\r|\n/u)) {
        if (line.startsWith("event:")) event = line.slice("event:".length).trim();
        else if (line.startsWith("data:")) data = true;
    }
    return { text, event, data };
}

/** The `reserved_result_id` of an `accepted` frame's data, when it is a result id. */
function reservedOf(text: string): string | null {
    const line = text.split(/\r\n|\r|\n/u).find((part) => part.startsWith("data:"));
    if (line === undefined) return null;
    try {
        const value = (JSON.parse(line.slice("data:".length)) as { reserved_result_id?: unknown })
            .reserved_result_id;
        return typeof value === "string" && /^result_[0-9a-f]{32}$/u.test(value) ? value : null;
    } catch {
        return null;
    }
}

/** The frame with `seq` 2 changed to 9 in its one `data` line, or why it could not be. */
function corrupted(text: string): { text: string } | { reason: string } {
    const parts = text.split(/(\r\n|\r|\n)/u);
    const index = parts.findIndex((part) => part.startsWith("data:"));
    if (index < 0) return { reason: "the second frame has no data line" };
    const line = parts[index]!;
    const json = line.slice("data:".length).replace(/^ /u, "");
    const prefix = line.slice(0, line.length - json.length);
    const seqOf = (value: string): unknown => {
        try {
            return (JSON.parse(value) as { seq?: unknown }).seq;
        } catch {
            return undefined;
        }
    };
    if (seqOf(json) !== 2) return { reason: "the second frame's seq is not 2" };
    const changed = json.replace(/"seq"\s*:\s*2(?=\s*[,}])/u, '"seq":9');
    if (seqOf(changed) !== 9) return { reason: "the second frame's top-level seq was not changed" };
    parts[index] = `${prefix}${changed}`;
    return { text: parts.join("") };
}

/** A key and certificate for 127.0.0.1, made for this proxy and gone from disk at once. */
function throwawayCertificate(): { key: string; cert: string } {
    const dir = mkdtempSync(join(tmpdir(), "ask-dev-fault-proxy-"));
    const keyFile = join(dir, "key.pem");
    const certFile = join(dir, "cert.pem");
    try {
        execFileSync(
            "openssl",
            [
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-keyout",
                keyFile,
                "-out",
                certFile,
                "-days",
                "1",
                "-subj",
                "/CN=127.0.0.1",
            ],
            { stdio: "ignore" },
        );
        return { key: readFileSync(keyFile, "utf8"), cert: readFileSync(certFile, "utf8") };
    } catch (error) {
        throw new Error(
            `the fault proxy needs openssl for its https certificate: ${(error as Error).message}`,
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

export async function startFaultProxy(target: string, mode: FaultMode): Promise<FaultProxy> {
    const acr = new URL(target);
    const secure = acr.protocol === "https:";
    const exchanges: ProxyExchange[] = [];
    const upstreams = new Set<http.ClientRequest>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let unauthorizedSent = false;

    const handle = (req: http.IncomingMessage, res: http.ServerResponse): void => {
        const receivedAt = Date.now();
        const since = () => Date.now() - receivedAt;
        const exchange: ProxyExchange = {
            method: req.method ?? "",
            path: new URL(req.url ?? "/", "http://proxy.invalid").pathname,
            receivedAt,
            acrStatus: null,
            acrRequestId: null,
            browserStatus: null,
            fault: "none",
            faulted: false,
            upstreamError: null,
            reservedResultId: null,
            acrTerminal: null,
            at: {},
        };
        exchanges.push(exchange);
        const fault = (words: string) => {
            exchange.fault = words;
            exchange.faulted = true;
            exchange.at.fault = since();
        };

        if (mode === "unauthorized-once" && !unauthorizedSent) {
            unauthorizedSent = true;
            req.resume();
            // ACR's 401 carries its CORS headers; without them the browser reads a network error.
            const origin = req.headers.origin;
            res.writeHead(401, {
                "Content-Length": "0",
                Vary: "Origin",
                "Access-Control-Expose-Headers": EXPOSE_HEADERS,
                ...(origin === undefined ? {} : { "Access-Control-Allow-Origin": origin }),
            });
            exchange.browserStatus = 401;
            res.end();
            exchange.at.ended = since();
            fault("answered 401 itself, with no body; nothing went to ACR");
            return;
        }

        const options: https.RequestOptions = {
            protocol: acr.protocol,
            hostname: acr.hostname,
            port: acr.port === "" ? (secure ? 443 : 80) : Number(acr.port),
            method: req.method,
            path: req.url,
            headers: { ...req.headers, host: acr.host },
            // A fresh connection: dropping it is what ends ACR's run.
            agent: false,
            // Node names the TLS server from `Host` (never an IP) and checks ACR's certificate: a
            // stack with its own CA runs the specs with NODE_EXTRA_CA_CERTS naming that CA.
        };
        const upstream = (secure ? https : http).request(options);
        upstreams.add(upstream);
        upstream.on("close", () => upstreams.delete(upstream));

        let endedByProxy = false;
        /** The proxy drops ACR's connection itself: what follows is not ACR's error. */
        let dropped = false;
        const drop = () => {
            dropped = true;
            upstream.destroy();
        };
        const endBrowser = () => {
            if (endedByProxy || res.writableEnded) return;
            endedByProxy = true;
            res.end();
            exchange.at.ended = since();
        };
        // A socket the other side closed errors here; the close says what it means.
        req.on("error", () => undefined);
        res.on("error", () => undefined);
        res.on("close", () => {
            if (!endedByProxy && !res.writableEnded) exchange.at.browserGone = since();
            // This mode ended the browser's response itself and keeps reading ACR.
            if (mode === "end-after-accepted-keep-acr" && endedByProxy) return;
            drop();
        });
        if (mode === "hold-headers") {
            fault(`held ACR's response headers ${String(HOLD_HEADERS_MS)} ms after the request`);
        }

        upstream.on("error", (error: NodeJS.ErrnoException) => {
            if (dropped) return;
            exchange.upstreamError ??= error.code ?? error.name;
            if (!res.headersSent && !res.destroyed) {
                res.writeHead(502, { "Content-Length": "0" });
                exchange.browserStatus = 502;
            }
            endBrowser();
        });
        req.pipe(upstream);

        upstream.on("response", (answer) => {
            answer.on("error", () => undefined);
            exchange.at.acrHeaders = since();
            exchange.acrStatus = answer.statusCode ?? null;
            const id = answer.headers["x-request-id"];
            exchange.acrRequestId = typeof id === "string" ? id : null;
            const sendHeaders = () => {
                if (res.destroyed) return false;
                res.writeHead(answer.statusCode ?? 502, answer.statusMessage, answer.rawHeaders);
                exchange.browserStatus = answer.statusCode ?? 502;
                return true;
            };

            if (mode === "hold-headers") {
                answer.pause();
                const wait = Math.max(0, HOLD_HEADERS_MS - since());
                const timer = setTimeout(() => {
                    timers.delete(timer);
                    if (!sendHeaders()) return;
                    answer.on("data", (chunk: Buffer) => res.write(chunk));
                    answer.on("end", endBrowser);
                    answer.resume();
                }, wait);
                timers.add(timer);
                return;
            }

            if (!sendHeaders()) return;
            const framed =
                answer.statusCode === 200 &&
                /^text\/event-stream\b/iu.test(String(answer.headers["content-type"] ?? ""));
            if (!framed) {
                answer.on("data", (chunk: Buffer) => res.write(chunk));
                answer.on("end", endBrowser);
                return;
            }

            const decoder = new StringDecoder("utf8");
            let pending = "";
            let frames = 0;
            /** After the fault, nothing more goes to the browser. */
            let silent = false;
            const forward = (frame: Frame): void => {
                if (frame.event === "accepted")
                    exchange.reservedResultId ??= reservedOf(frame.text);
                if (frame.event === "result" || frame.event === "error") {
                    exchange.acrTerminal ??= frame.event;
                }
                if (silent) return;
                if (frame.data) frames += 1;
                if (frame.event === "accepted") exchange.at.accepted ??= since();
                switch (mode) {
                    case "hold-after-accepted":
                        res.write(frame.text);
                        if (frame.event === "accepted") {
                            silent = true;
                            fault("held everything after the end of the accepted frame");
                        }
                        return;
                    case "corrupt-second-frame": {
                        if (frames !== 2 || !frame.data) {
                            res.write(frame.text);
                            return;
                        }
                        const changed = corrupted(frame.text);
                        if ("reason" in changed) {
                            exchange.fault = `not corrupted: ${changed.reason}`;
                            res.write(frame.text);
                            return;
                        }
                        res.write(changed.text);
                        fault("changed seq from 2 to 9 in the second frame's data");
                        return;
                    }
                    case "cut-after-first-stage":
                        res.write(frame.text);
                        if (frame.event === "stage") {
                            silent = true;
                            fault("ended the response after the first stage frame");
                            endBrowser();
                            drop();
                        }
                        return;
                    case "end-after-accepted-keep-acr":
                        res.write(frame.text);
                        if (frame.event === "accepted") {
                            silent = true;
                            fault("ended the response after the accepted frame; ACR read on");
                            endBrowser();
                        }
                        return;
                    case "cut-before-terminal":
                        if (frame.event === "result" || frame.event === "error") {
                            silent = true;
                            fault(`ended the response before the ${frame.event} frame`);
                            endBrowser();
                            drop();
                            return;
                        }
                        res.write(frame.text);
                        return;
                    default:
                        res.write(frame.text);
                }
            };
            answer.on("data", (chunk: Buffer) => {
                pending += decoder.write(chunk);
                for (let found = BOUNDARY.exec(pending); found; found = BOUNDARY.exec(pending)) {
                    const end = found.index + found[0].length;
                    const text = pending.slice(0, end);
                    pending = pending.slice(end);
                    forward(frameOf(text));
                }
            });
            answer.on("end", () => {
                const rest = pending + decoder.end();
                pending = "";
                // A held browser socket stays open even when ACR's run ends.
                if (silent) return;
                if (rest !== "") res.write(rest);
                endBrowser();
            });
        });
    };

    const server = secure
        ? https.createServer(throwawayCertificate(), handle)
        : http.createServer(handle);
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve());
    });
    const { port } = server.address() as AddressInfo;

    return {
        origin: `${secure ? "https" : "http"}://127.0.0.1:${String(port)}`,
        mode,
        exchanges,
        record: () => exchanges.map((exchange) => ({ ...exchange, at: { ...exchange.at } })),
        close: async () => {
            for (const timer of timers) clearTimeout(timer);
            for (const upstream of upstreams) upstream.destroy();
            const closed = new Promise<void>((resolve) => server.close(() => resolve()));
            server.closeAllConnections();
            await closed;
        },
    };
}
