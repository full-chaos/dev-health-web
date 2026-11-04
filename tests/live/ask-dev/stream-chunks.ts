import type { Page } from "@playwright/test";

import type { StreamChunk } from "./reattach-views";
import { ACR, INVESTIGATIONS_PATH } from "./stack";

/** One investigation stream the page read: the create's POST, or an attach's GET of a run's events. */
export type RecordedStream = {
    readonly method: string;
    readonly path: string;
    readonly status: number;
    /** The attach's `Last-Event-ID`, as the page sent it; null when it sent none. */
    readonly lastEventId: string | null;
    /** Epoch ms when the page's fetch was made. */
    readonly sentAt: number;
    readonly chunks: readonly StreamChunk[];
    /** Epoch ms when the stream ended, or the page's own abort ended its clone. */
    readonly endedAt: number;
    readonly error?: string;
};

const BINDING = "__askDevLiveChunks";

/**
 * CHAOS-12233: runs IN THE PAGE (`page.addInitScript`), before the app's own scripts. Like
 * `teeInvestigationStreams` (stack.ts), it wraps `fetch` and reads a CLONE of each investigation
 * stream (the create's POST and an attach's `GET …/submissions/{id}/events`), so the app streams as
 * before. It keeps each chunk's text and arrival time, the status, and the attach's `Last-Event-ID`:
 * no other header, no bearer, no request body. Self-contained: Playwright sends its source.
 */
export function recordStreams(options: { origin: string; path: string; binding: string }): void {
    const scope = window as unknown as Record<string, unknown>;
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const sentAt = Date.now();
        const response = await original(input, init);
        try {
            const request = input instanceof Request ? input : null;
            const url = new URL(request?.url ?? String(input), window.location.href);
            const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
            const tail = url.pathname.startsWith(`${options.path}/`)
                ? url.pathname.slice(options.path.length + 1)
                : "";
            const isStream =
                url.origin === options.origin &&
                ((method === "POST" && url.pathname === options.path) ||
                    (method === "GET" && /^submissions\/[^/]+\/events$/u.test(tail)));
            const send = scope[options.binding];
            if (isStream && typeof send === "function") {
                const headers = new Headers(init?.headers ?? request?.headers ?? undefined);
                const lastEventId = headers.get("last-event-id");
                const clone = response.clone();
                void (async () => {
                    const chunks: Array<{ at: number; text: string }> = [];
                    const decoder = new TextDecoder();
                    let error: string | undefined;
                    try {
                        const reader = clone.body?.getReader();
                        if (reader !== undefined) {
                            for (;;) {
                                const { value, done } = await reader.read();
                                if (done) break;
                                chunks.push({
                                    at: Date.now(),
                                    text: decoder.decode(value, { stream: true }),
                                });
                            }
                        }
                    } catch (failure: unknown) {
                        error = failure instanceof Error ? failure.message : String(failure);
                    }
                    (send as (message: unknown) => unknown)({
                        method,
                        path: url.pathname,
                        status: response.status,
                        lastEventId,
                        sentAt,
                        chunks,
                        endedAt: Date.now(),
                        ...(error === undefined ? {} : { error }),
                    });
                })();
            }
        } catch {
            // The page's own fetch is never broken by the test's recorder.
        }
        return response;
    };
}

/** Every investigation stream this page reads, in the order each ends. Call before the first navigation. */
export async function watchStreams(
    page: Pick<Page, "exposeBinding" | "addInitScript">,
): Promise<RecordedStream[]> {
    const streams: RecordedStream[] = [];
    await page.exposeBinding(BINDING, (_source, message: RecordedStream) => {
        streams.push(message);
    });
    await page.addInitScript(recordStreams, {
        origin: ACR,
        path: INVESTIGATIONS_PATH,
        binding: BINDING,
    });
    return streams;
}
