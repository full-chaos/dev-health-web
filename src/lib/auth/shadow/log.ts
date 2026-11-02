import "server-only";
import { logger as defaultLogger } from "@/lib/logger";

// One line per run and one per mismatch. The field set is closed: no token, no principal
// reference, no user id, no organization id.

export type ShadowOutcome = "match" | "mismatch" | "unavailable" | "no_action";

export interface ShadowLogger {
    info(fields: Record<string, unknown>, message: string): void;
}

export interface MismatchRecord {
    surface: string;
    action: string;
    clientAllowed: boolean;
    decisionAllowed: boolean;
    reasonCode: string;
    decisionId: string;
    requestId: string;
}

export interface RunRecord {
    counts: Record<ShadowOutcome, number>;
    surfaces: readonly string[];
    mismatches: readonly MismatchRecord[];
}

export const RUN_MESSAGE = "authz_shadow_decide";
export const MISMATCH_MESSAGE = "authz_shadow_mismatch";

export function logRun(record: RunRecord, log: ShadowLogger = defaultLogger): void {
    log.info(
        {
            match: record.counts.match,
            mismatch: record.counts.mismatch,
            unavailable: record.counts.unavailable,
            no_action: record.counts.no_action,
            surfaces: record.surfaces.join(","),
        },
        RUN_MESSAGE,
    );
    for (const m of record.mismatches) {
        log.info(
            {
                surface: m.surface,
                action: m.action,
                client_allowed: m.clientAllowed,
                decision_allowed: m.decisionAllowed,
                reason_code: m.reasonCode,
                decision_id: m.decisionId,
                request_id: m.requestId,
                outcome: "mismatch",
            },
            MISMATCH_MESSAGE,
        );
    }
}
