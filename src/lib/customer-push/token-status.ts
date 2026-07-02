/**
 * Client-derived token status. `CustomerPushToken` carries no `status` or
 * `last_result` field from the backend (SYNTHESIZER RECONCILIATION #2) —
 * status is derived here from `revoked_at`/`expires_at`/`last_used_at` so
 * every list/card in the UI applies the same precedence.
 */

import type { CustomerPushToken } from "@/lib/admin/types";

export type CustomerPushTokenStatus = "active" | "revoked" | "expired" | "never_used";

export function deriveTokenStatus(
    token: Pick<CustomerPushToken, "revoked_at" | "expires_at" | "last_used_at">,
): CustomerPushTokenStatus {
    if (token.revoked_at) return "revoked";
    if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) return "expired";
    if (!token.last_used_at) return "never_used";
    return "active";
}

export const TOKEN_STATUS_LABELS: Record<CustomerPushTokenStatus, string> = {
    active: "Active",
    revoked: "Revoked",
    expired: "Expired",
    never_used: "Never used",
};
