import "server-only";

import type { Transport } from "@/lib/auth/authorize/client";

/**
 * The seam for the production `/v1/authorize` transport and its web workload credential
 * (CHAOS-12661). Until that leaf lands there is none: `null` makes every grant-based scope read
 * refuse, never fall back to the inventory.
 */
export function loadAuthorizeTransport(): Transport | null {
    return null;
}
