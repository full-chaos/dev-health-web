import "server-only";
import { logger as defaultLogger } from "@/lib/logger";

// One line per decision. The field set is closed: no token, no principal reference, no user id,
// no organization id.

export interface DecideLogger {
    info(fields: Record<string, unknown>, message: string): void;
    warn?(fields: Record<string, unknown>, message: string): void;
}

export interface DecisionRecord {
    guard: string;
    action: string;
    allowed: boolean;
    source: "pdp" | "client";
    reasonCode: string;
    requestId?: string;
}

export const DECIDE_MESSAGE = "authz_decide";

export function logDecision(record: DecisionRecord, log: DecideLogger = defaultLogger): void {
    log.info(
        {
            guard: record.guard,
            action: record.action,
            allowed: record.allowed,
            source: record.source,
            reason_code: record.reasonCode,
            ...(record.requestId === undefined ? {} : { request_id: record.requestId }),
        },
        DECIDE_MESSAGE,
    );
}

export const DECIDE_TIMEOUT_MESSAGE = "authz_decide_timeout";

let timeoutsTotal = 0;

export interface TimeoutRecord {
    guard: string;
    action: string;
    requestId: string;
    budgetMs: number;
    elapsedMs: number;
    exchangeMs: number;
}

// The decide budget won the race against the decision point: durations and counts only.
export function logDecideTimeout(record: TimeoutRecord, log: DecideLogger = defaultLogger): void {
    timeoutsTotal++;
    const fields = {
        guard: record.guard,
        action: record.action,
        request_id: record.requestId,
        budget_ms: record.budgetMs,
        elapsed_ms: record.elapsedMs,
        exchange_ms: record.exchangeMs,
        timeouts_total: timeoutsTotal,
    };
    if (log.warn) log.warn(fields, DECIDE_TIMEOUT_MESSAGE);
    else log.info(fields, DECIDE_TIMEOUT_MESSAGE);
}
