/**
 * Client keys of an Ask Dev conversation (plan §2.5, INV-2). The browser mints both; ACR checks
 * them against its client correlation id grammar and refuses a malformed one with a 400.
 *
 * - `thread_id` (`X-ACR-Thread-ID`): one per conversation, sent on every turn.
 * - `submission_id` (`X-ACR-Submission-ID`): one per user submit. It is reused ONLY to retry the
 *   identical request: ACR binds it to the request digest and runs a key at most once.
 */

/** ACR's client correlation id grammar (`context_fabric_submission_status.v1`). */
export const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function isCorrelationId(value: string): boolean {
    return CORRELATION_ID_PATTERN.test(value);
}

const hex = (uuid: string) => uuid.replaceAll("-", "");

/** A fresh `submission_id`: `sub_` and 32 hex digits. */
export function newSubmissionId(uuid: string = crypto.randomUUID()): string {
    return `sub_${hex(uuid)}`;
}

/** A fresh `thread_id`: `thread_` and 32 hex digits. */
export function newThreadId(uuid: string = crypto.randomUUID()): string {
    return `thread_${hex(uuid)}`;
}

/**
 * A short, stable tag of a partition key (FNV-1a, 32 bits): it names no org or user. Session
 * storage keeps only this tag next to a conversation (CHAOS-11934, CHAOS-11956).
 */
export function partitionTag(key: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < key.length; index++) {
        hash ^= key.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}
