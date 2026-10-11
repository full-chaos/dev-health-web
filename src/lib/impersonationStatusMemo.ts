import "server-only";
import { getBackendUrl } from "@/lib/origin";
import { processMemo } from "@/lib/processMemo";
import { deadlineFetch } from "@/lib/serverDeadline";

/**
 * The impersonation status of a superuser, read from the backend for the jwt callback
 * (CHAOS-2328), with ONE backend read for callers that arrive together (CHAOS-9218).
 *
 * The jwt callback runs on every session read: in the proxy for every request, and again in the
 * render or the route handler. Those are separate HTTP requests and separate bundles, so the
 * request-scoped `cache()` of React cannot join them. The state here is per Node process
 * (`processMemo`), and per USER:
 *
 *  - Key: the id of the signed-in user, from the signed session token. The backend keeps the
 *    impersonation state per admin user too. A status is never served under another key, and a
 *    session with no user id gets its own read and nothing is kept for it.
 *  - Keep: a status the backend sent is served for 3 s. This bounds the reads of a superuser to
 *    one per 3 s per process. It is also the longest time a change made through ANOTHER web
 *    process stays unseen.
 *  - Shared read: while a read of a user is in flight, a caller that needs a read waits for
 *    that read. The entry of the read is removed when it ends, with an answer or with an error.
 *  - Failure: only a status the backend sent with a 2xx answer is kept. After a read that threw
 *    (network error, deadline) no new read starts for 30 s (CHAOS-9114: each caller would wait
 *    the full deadline); the callers keep the state they have. A later good answer ends that
 *    wait. An answer that is not 2xx starts no wait: the next caller reads again.
 *  - A change: `force` (the `update()` trigger of the session) always starts a NEW read, and
 *    `forgetImpersonationStatus` (the start and stop actions) drops the entry of the user. An
 *    answer of a read that began before either one is not kept: only the newest read writes.
 *  - Server only: `import "server-only"` makes a client import fail the build. The run-time guard
 *    stays as a second line: in a browser the read does nothing (no backend read, no state).
 *  - Size: an entry with nothing in flight, nothing kept in time and no wait is removed; above
 *    `MAX_USERS` the oldest such entries go first.
 */
export interface ImpersonationStatusSnapshot {
    is_impersonating: boolean;
    impersonated_user_id?: string;
    impersonated_email?: string;
    impersonated_org_id?: string;
}

export const IMPERSONATION_STATUS_KEEP_MS = 3_000;
export const IMPERSONATION_STATUS_FAILURE_BACKOFF_MS = 30_000;
/** Superusers only, so the real number is small; this is the hard limit. */
export const IMPERSONATION_STATUS_MAX_USERS = 256;

interface Entry {
    kept?: { readonly at: number; readonly status: ImpersonationStatusSnapshot };
    failedUntil?: number;
    /** The newest read of this user that has not ended. */
    inFlight?: Promise<ImpersonationStatusSnapshot | undefined>;
    /** Number of the newest read of this user: an older read writes nothing. */
    generation: number;
}

// One Map per process, not per bundle (CHAOS-8466).
const entries = processMemo<Entry>("impersonationStatusShared");

export interface ImpersonationStatusRequest {
    /** The id of the signed-in user, from the session token. */
    readonly userId: unknown;
    readonly accessToken: string;
    /** Read the backend now, whatever is kept (the `update()` trigger). */
    readonly force: boolean;
    readonly now: number;
}

/**
 * The status to write on the session token, or `undefined` when there is none to write (the
 * read failed, or a read failed a moment ago): the caller then keeps the state it has.
 */
export async function readImpersonationStatus(
    request: ImpersonationStatusRequest,
): Promise<ImpersonationStatusSnapshot | undefined> {
    if (typeof window !== "undefined") return undefined;
    const { userId, accessToken, force, now } = request;
    if (typeof userId !== "string" || userId === "") {
        // No key that belongs to one user: read for this caller only, keep nothing.
        return fetchStatus(accessToken).catch(() => undefined);
    }

    const existing = entries.get(userId);
    if (!force && existing !== undefined) {
        if (existing.kept !== undefined && now - existing.kept.at < IMPERSONATION_STATUS_KEEP_MS) {
            return existing.kept.status;
        }
        if (now < (existing.failedUntil ?? 0)) return undefined;
        if (existing.inFlight !== undefined) return existing.inFlight;
    }

    const entry = existing ?? { generation: 0 };
    // Set again: the Map keeps insertion order, so the newest reader is the last to be removed.
    entries.delete(userId);
    entries.set(userId, entry);

    const generation = (entry.generation += 1);
    const read = fetchStatus(accessToken).then(
        (status) => {
            if (status !== undefined && entry.generation === generation) {
                entry.kept = { at: now, status };
                entry.failedUntil = undefined;
            }
            return status;
        },
        () => {
            // Network error or deadline: nothing is kept; no new read for 30 s.
            if (entry.generation === generation) {
                entry.failedUntil = Date.now() + IMPERSONATION_STATUS_FAILURE_BACKOFF_MS;
            }
            return undefined;
        },
    );
    const shared = read.finally(() => {
        if (entry.inFlight === shared) entry.inFlight = undefined;
    });
    entry.inFlight = shared;
    removeEndedEntries(now);
    return shared;
}

/**
 * Drops what is kept for one user, after an action that changes the status (start, stop). The
 * next read of that user goes to the backend, and a read that is in flight now is not kept.
 */
export function forgetImpersonationStatus(userId: unknown): void {
    if (typeof userId !== "string") return;
    // A read in flight keeps its own entry object: its answer does not reach the map again.
    entries.delete(userId);
}

/** Tests only. */
export function resetImpersonationStatusForTests(): void {
    entries.clear();
}

/** Tests only: the user ids that have an entry, oldest first. */
export function impersonationStatusKeysForTests(): string[] {
    return [...entries.keys()];
}

/** Called when a read has just started: the entry of that read is in flight and stays. */
function removeEndedEntries(now: number): void {
    for (const [key, entry] of entries) {
        if (isEnded(entry, now)) entries.delete(key);
    }
    let over = entries.size - IMPERSONATION_STATUS_MAX_USERS;
    if (over <= 0) return;
    for (const [key, entry] of entries) {
        if (over <= 0) break;
        // A read in flight has callers that wait for it: it ends by itself at the deadline.
        if (entry.inFlight !== undefined) continue;
        entries.delete(key);
        over -= 1;
    }
}

function isEnded(entry: Entry, now: number): boolean {
    if (entry.inFlight !== undefined) return false;
    if (entry.kept !== undefined && now - entry.kept.at < IMPERSONATION_STATUS_KEEP_MS) {
        return false;
    }
    return now >= (entry.failedUntil ?? 0);
}

/** One backend read. Throws on a network error or on the deadline; `undefined` when not 2xx. */
async function fetchStatus(accessToken: string): Promise<ImpersonationStatusSnapshot | undefined> {
    const response = await deadlineFetch("auth")(
        `${getBackendUrl()}/api/v1/admin/impersonate/status`,
        {
            method: "GET",
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    if (!response.ok) return undefined;
    const body = (await response.json()) as {
        is_impersonating: boolean;
        target_user_id?: string | null;
        target_email?: string | null;
        target_org_id?: string | null;
    };
    return {
        is_impersonating: body.is_impersonating,
        impersonated_user_id: body.target_user_id ?? undefined,
        impersonated_email: body.target_email ?? undefined,
        impersonated_org_id: body.target_org_id ?? undefined,
    };
}
