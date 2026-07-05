/**
 * Single source of truth for integration credential status.
 *
 * CHAOS-2837 groundwork: CredentialCard, ProviderCredentialsList, and the
 * integrations list page each computed this status independently and
 * disagreed — most notably, an untested credential (never tested, or last
 * test result unknown) silently rendered as "connected" in some surfaces.
 * Every surface must derive status through `deriveCredentialStatus` so an
 * untested credential always reads as "untested", never "connected".
 */
import type { IntegrationCredential } from "@/lib/admin/types";

/** Credential status, derived purely from persisted fields. */
export type CredentialStatus = "connected" | "failing" | "untested" | "inactive";

/**
 * Rollup priority (most to least urgent) for aggregating multiple
 * credentials of the same provider into a single visual status: a failing
 * credential outranks an untested one, which outranks a merely-inactive one.
 */
export const CREDENTIAL_STATUS_PRIORITY: readonly CredentialStatus[] = [
    "failing",
    "untested",
    "connected",
    "inactive",
];

type CredentialStatusTone = "positive" | "caution" | "negative" | "neutral";

type CredentialStatusMeta = {
    /** Customer-safe copy (docs/design-system.md A8 — no internal jargon). */
    label: string;
    tone: CredentialStatusTone;
};

function assertNever(value: never): never {
    throw new Error(`Unhandled credential status: ${JSON.stringify(value)}`);
}

function credentialStatusMeta(status: CredentialStatus): CredentialStatusMeta {
    switch (status) {
        case "connected":
            return { label: "Connected", tone: "positive" };
        case "failing":
            return { label: "Connection failing", tone: "negative" };
        case "untested":
            return { label: "Needs verification", tone: "caution" };
        case "inactive":
            return { label: "Inactive", tone: "neutral" };
        default:
            return assertNever(status);
    }
}

/** Status → {label, tone} lookup, derived from the exhaustive switch above. */
export const CREDENTIAL_STATUS_META: Record<CredentialStatus, CredentialStatusMeta> = {
    connected: credentialStatusMeta("connected"),
    failing: credentialStatusMeta("failing"),
    untested: credentialStatusMeta("untested"),
    inactive: credentialStatusMeta("inactive"),
};

/**
 * Derive a credential's status from its persisted fields only.
 *
 * Rules:
 * - `is_active === false` → "inactive" (deactivated; test result is moot).
 * - `is_active` and `last_test_success === true` → "connected".
 * - `is_active` and `last_test_success === false` → "failing".
 * - `is_active` and `last_test_success` is `null`/`undefined` → "untested"
 *   (never tested, or the test result is unknown) — this is the case that
 *   must NEVER silently resolve to "connected".
 */
export function deriveCredentialStatus(credential: IntegrationCredential): CredentialStatus {
    if (!credential.is_active) return "inactive";
    if (credential.last_test_success === true) return "connected";
    if (credential.last_test_success === false) return "failing";
    return "untested";
}
