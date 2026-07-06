/**
 * Verification-snapshot fingerprinting (CHAOS-2837).
 *
 * `testConnection` is async; the user can go Back and edit any input while a
 * verify request is still in flight. If a stale resolution were allowed to
 * unconditionally mark the CURRENT form "verified", a credential could be
 * persisted against inputs that were never actually tested (a TOCTOU race).
 *
 * The fix: never store a bare "verified" boolean. Instead, fingerprint the
 * exact inputs a test ran against at the moment it was *called*, and derive
 * "is the current form verified" purely by comparing that stored fingerprint
 * to a fingerprint of the CURRENT inputs, computed fresh on every render. A
 * stale resolution for old inputs can only ever match its own (now stale)
 * fingerprint — never the live one — so it can never re-enable Finish for
 * inputs it didn't actually test.
 */

export type VerificationInputs = {
    provider: string;
    method: string | null;
    credentialName: string;
    fieldValues: Record<string, string>;
};

/**
 * Deterministic serialization of the inputs a verify-connection test ran
 * against. Field keys are sorted so insertion order (which depends on the
 * order form fields were touched) never produces a false mismatch.
 */
export function fingerprintVerificationInputs({
    provider,
    method,
    credentialName,
    fieldValues,
}: VerificationInputs): string {
    const sortedFields = Object.keys(fieldValues)
        .sort()
        .map((key) => [key, fieldValues[key]] as const);
    return JSON.stringify([provider, method, credentialName, sortedFields]);
}
