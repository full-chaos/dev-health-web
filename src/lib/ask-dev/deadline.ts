/**
 * The web rows of the Ask Dev deadline chain (plan 2.7.6, INV-3). Pure: the clock is injected, so
 * a test can pin it. One absolute deadline `D = t0 + W` bounds the whole run; every inner budget
 * is computed from what is LEFT of D at the moment it is used, never from a fixed number.
 */

/** `W` default and ceiling for `ASK_DEV_RUN_TIMEOUT_MS`. */
export const RUN_TIMEOUT_DEFAULT_MS = 120_000;
export const RUN_TIMEOUT_MAX_MS = 600_000;
/** Each setup read (entitlement, scopes) takes at most this, and never more than what is left. */
export const SETUP_STEP_MAX_MS = 5_000;
/** Headroom ACR keeps back from the budget header (it composes the degraded answer in it). */
export const WAIT_BUDGET_HEADROOM_MS = 5_000;
/** ACR honours no smaller budget (`ContextFabricWaitBudgetMinSeconds`, acr wait_budget.go). */
export const ACR_MIN_WAIT_BUDGET_SECONDS = 10;
/** Longest wait for ACR's response headers (admission). */
export const HEADER_WAIT_MAX_MS = 15_000;
/** No upstream bytes for this long once the stream is open means the run stalled. */
export const STALL_MS = 30_000;

export type RunTimeout = {
    readonly ms: number;
    /** `default` when unset, `clamped` when above the ceiling, `invalid` when it did not parse. */
    readonly source: "configured" | "default" | "clamped" | "invalid";
};

/** Reads `ASK_DEV_RUN_TIMEOUT_MS`: unset or invalid is the default, above the ceiling is clamped. */
export function resolveRunTimeout(raw: string | undefined): RunTimeout {
    if (raw === undefined || raw.trim() === "") {
        return { ms: RUN_TIMEOUT_DEFAULT_MS, source: "default" };
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return { ms: RUN_TIMEOUT_DEFAULT_MS, source: "invalid" };
    }
    if (parsed > RUN_TIMEOUT_MAX_MS) return { ms: RUN_TIMEOUT_MAX_MS, source: "clamped" };
    return { ms: parsed, source: "configured" };
}

export type WaitBudget =
    | { readonly ok: true; readonly seconds: number }
    | { readonly ok: false; readonly seconds: number };

export class RunDeadline {
    readonly startedAt: number;
    readonly deadlineAt: number;

    constructor(
        readonly runTimeoutMs: number,
        private readonly now: () => number = Date.now,
    ) {
        this.startedAt = now();
        this.deadlineAt = this.startedAt + runTimeoutMs;
    }

    elapsedMs(): number {
        return this.now() - this.startedAt;
    }

    remainingMs(): number {
        return Math.max(0, this.deadlineAt - this.now());
    }

    /** `min(cap, D - now)`, never negative. */
    boundedMs(capMs: number): number {
        return Math.min(capMs, this.remainingMs());
    }

    /**
     * The `X-ACR-Wait-Budget-Seconds` value for a call sent NOW: `floor((D - now - 5 s) / 1 s)`.
     * `ok` is false when it is below ACR's minimum: the caller must not call ACR.
     */
    waitBudget(): WaitBudget {
        const seconds = Math.floor((this.remainingMs() - WAIT_BUDGET_HEADROOM_MS) / 1_000);
        return { ok: seconds >= ACR_MIN_WAIT_BUDGET_SECONDS, seconds };
    }
}
