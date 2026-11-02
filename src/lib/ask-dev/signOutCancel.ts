/**
 * Sign-out's way to the conversation store's live runs (CHAOS-12574). With ACR's run lease on, a
 * disconnect does not cancel a run, so a sign-out that only drops the stream left ACR's run going
 * to its end. Sign-out now asks the store first, while the tab still holds its ACR token, to send
 * ACR's cancel for each run it holds.
 *
 * The store of the mounted shell registers here; sign-out (which every page loads) calls in. A
 * module of its own, so sign-out does not load the store.
 */

type Canceller = (signal: AbortSignal) => Promise<void>;

let current: Canceller | null = null;

/** Registers the shell's store; the returned function unregisters it (and nothing newer). */
export function registerSignOutCancel(cancel: Canceller): () => void {
    current = cancel;
    return () => {
        if (current === cancel) current = null;
    };
}

/** Sign-out step 0: the registered store cancels its live runs. Nothing when none is registered. */
export async function cancelLiveRunForSignOut(signal: AbortSignal): Promise<void> {
    const cancel = current;
    if (cancel !== null) await cancel(signal);
}
