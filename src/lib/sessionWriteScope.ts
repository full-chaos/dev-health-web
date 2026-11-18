import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

// One proxy session read's scope: whether this read's jwt callback changed the session state (a
// refresh call of any outcome, an impersonation stop or end). It is per async context, so a refresh
// in one request never marks another request's read. Outside a scope the mark is a no-op.
const reads = new AsyncLocalStorage<{ changed: boolean }>();

export function runSessionRead<T>(read: () => Promise<T>): Promise<{ value: T; changed: boolean }> {
    const state = { changed: false };
    return reads.run(state, async () => ({ value: await read(), changed: state.changed }));
}

export function markSessionChanged(): void {
    const state = reads.getStore();
    if (state) state.changed = true;
}

/**
 * Whether this read already changed the session. Once it has, the read does no further optional network
 * step (the impersonation status read, the periodic validation): they run on the next read, so a slow one
 * cannot push this read past the proxy deadline and lose the change. False outside a proxy read.
 */
export function sessionChangedInThisRead(): boolean {
    return reads.getStore()?.changed ?? false;
}
