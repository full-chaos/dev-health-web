import "server-only";
import { logger as defaultLogger } from "@/lib/logger";

// One line per decision. The field set is closed: no token, no principal reference, no user id,
// no organization id.

export interface DecideLogger {
    info(fields: Record<string, unknown>, message: string): void;
}

export interface DecisionRecord {
    guard: string;
    action: string;
    allowed: boolean;
    source: "pdp" | "client";
    reasonCode: string;
    decisionId?: string;
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
            ...(record.decisionId === undefined ? {} : { decision_id: record.decisionId }),
            ...(record.requestId === undefined ? {} : { request_id: record.requestId }),
        },
        DECIDE_MESSAGE,
    );
}
