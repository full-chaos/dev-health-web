import "server-only";
import type { Transport } from "../authorize/client";

// The switch is off unless the value is exactly the on value ("on" by default).
export function decideEnforced(value: string | undefined, onValue = "on"): boolean {
    return value === onValue;
}

// The seam for the real /v1/authorize transport (a workload credential exchange), which a
// separate leaf adds. Until then no transport exists and a guard that is switched on denies.
export function getDecideTransport(): Transport | undefined {
    return undefined;
}

// A human-initiated action may wait longer than the shadow's budget.
export const DECIDE_TIMEOUT_MS = 1500;
