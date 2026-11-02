import "server-only";
import type { Transport } from "../authorize/client";

// The switch is off unless the value is exactly "on".
export function shadowEnabled(value: string | undefined): boolean {
    return value === "on";
}

// The seam for the real /v1/authorize transport (a workload credential exchange), which a
// separate leaf adds. Until then no transport exists and the shadow makes no call.
export function getShadowTransport(): Transport | undefined {
    return undefined;
}

export const SHADOW_TIMEOUT_MS = 800;
export const SAMPLE_WINDOW_MS = 5 * 60 * 1000;
