import "server-only";

import type { Transport } from "@/lib/auth/authorize/client";
import { createAuthorizeTransport } from "@/lib/auth/authorize/transport";
import { workloadTokenConfigured } from "@/lib/auth/workload/token";

/**
 * The `/v1/authorize` transport for grant-based ACR scopes: the web authorize transport and its
 * workload credential, the same one the web decisions use. With the workload token env incomplete
 * there is none: `null` makes every grant-based scope read refuse, never fall back to the inventory.
 */
export function loadAuthorizeTransport(): Transport | null {
    return workloadTokenConfigured() ? createAuthorizeTransport() : null;
}
