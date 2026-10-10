import { vi } from "vitest";

/**
 * A fetch that is accepted and never answered. Like the real fetch it rejects
 * only when its AbortSignal fires (a TimeoutError or an AbortError).
 */
export function stallingFetch(): typeof fetch {
    return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) return; // no deadline: the promise stays pending for ever
            const fail = () => reject(signal.reason);
            if (signal.aborted) fail();
            else signal.addEventListener("abort", fail, { once: true });
        });
    }) as unknown as typeof fetch;
}

/** Settle state of a promise, without waiting on it. */
export function track<T>(promise: Promise<T>) {
    const state: { settled: boolean; value?: T; error?: unknown } = { settled: false };
    promise.then(
        (value) => {
            state.settled = true;
            state.value = value;
        },
        (error: unknown) => {
            state.settled = true;
            state.error = error;
        },
    );
    return state;
}

/**
 * A response whose HEADERS arrive and whose BODY never ends. The body stream errors only when
 * the fetch signal fires, like the body of a real fetch.
 */
export function headersThenStalledBody(init?: RequestInit, status = 200): Response {
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            const fail = () => controller.error(signal?.reason);
            if (signal?.aborted) fail();
            else signal?.addEventListener("abort", fail, { once: true });
        },
    });
    return new Response(body, { status, headers: { "content-type": "application/json" } });
}
