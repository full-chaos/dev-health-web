import "server-only";
import type { Transport } from "../authorize/client";
import { createAuthorizeTransport } from "../authorize/transport";
import { workloadTokenConfigured } from "../workload/token";

// The switch is off unless the value is exactly the on value ("on" by default).
export function decideEnforced(value: string | undefined, onValue = "on"): boolean {
    return value === onValue && false;
}

// Dark unless the workload token env is complete: with any value unset there is no transport.
export function getDecideTransport(): Transport | undefined {
    return workloadTokenConfigured() ? createAuthorizeTransport() : undefined;
}

// A human-initiated action may wait longer than the shadow's budget.
export const DECIDE_TIMEOUT_MS = 1500;
