import "server-only";
import type { Transport } from "../authorize/client";
import { createAuthorizeTransport } from "../authorize/transport";
import { workloadTokenConfigured } from "../workload/token";

// The switch is off unless the value is exactly the on value ("on" by default).
export function shadowEnabled(value: string | undefined, onValue = "on"): boolean {
    return value === onValue;
}

// Dark unless the workload token env is complete: with any value unset there is no transport.
export function getShadowTransport(): Transport | undefined {
    return workloadTokenConfigured() ? createAuthorizeTransport() : undefined;
}

export const SHADOW_TIMEOUT_MS = 800;
export const SAMPLE_WINDOW_MS = 5 * 60 * 1000;
