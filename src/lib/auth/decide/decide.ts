import "server-only";
import type { Session } from "next-auth";
import { getServerEnv } from "@/lib/config";
import { authorize, type Transport } from "../authorize/client";
import { reasonToState } from "../reasonStates";
import { buildShadowRequest, newRequestId } from "../shadow/run";
import { GUARDS, type GuardId } from "./catalog";
import { DECIDE_TIMEOUT_MS, decideEnforced, getDecideTransport } from "./config";
import { logDecision, type DecideLogger } from "./log";

export type { GuardId } from "./catalog";

// A single policy decision for a guard that used to read a client role array. With the switch off
// the client rule decides, as before. With it on the decision point is the only verdict: the
// client rule is never read, and every failure to get a valid answer is a deny.

export interface DecideDeps {
    enforced: boolean;
    transport: Transport | undefined;
    timeoutMs?: number;
    log?: DecideLogger;
    nowMs?: () => number;
}

export type GuardVerdict = { allowed: true } | { allowed: false; message: string };

// Not a wire code: reasonToState maps an unknown code to the unavailable sentence.
const DECIDE_FAILED = "authz_decide_failed";

export function defaultDeps(): DecideDeps {
    return {
        enforced: decideEnforced(getServerEnv().AUTHZ_DECISIONS_ENFORCE),
        transport: getDecideTransport(),
    };
}

export async function decideGuard(
    session: Session,
    guardId: GuardId,
    deps: DecideDeps = defaultDeps(),
): Promise<GuardVerdict> {
    const guard = GUARDS[guardId];
    if (!deps.enforced || guard.action === null) {
        return guard.legacy(session.user)
            ? { allowed: true }
            : { allowed: false, message: guard.legacyDenyMessage };
    }
    const action = guard.action;
    try {
        const deny = (code: string): GuardVerdict => ({
            allowed: false,
            message: reasonToState(code).message,
        });
        const requestId = newRequestId();
        const record = (
            allowed: boolean,
            source: "pdp" | "client",
            reasonCode: string,
            decisionId?: string,
        ) =>
            logDecision(
                { guard: guardId, action, allowed, source, reasonCode, decisionId, requestId },
                deps.log,
            );

        const request =
            session.access_token && deps.transport
                ? buildShadowRequest(
                      { action, resource: guard.resource },
                      {
                          orgId: session.user?.org_id,
                          principalReference: session.access_token,
                          requestId,
                      },
                  )
                : null;
        if (!request || !deps.transport) {
            record(false, "client", "unavailable");
            return deny("unavailable");
        }
        const outcome = await authorize(request, {
            transport: deps.transport,
            timeoutMs: deps.timeoutMs ?? DECIDE_TIMEOUT_MS,
            nowMs: deps.nowMs,
        });
        if (outcome.allowed) {
            record(true, "pdp", outcome.decision.reasonCode, outcome.decision.decisionId);
            return { allowed: true };
        }
        if (outcome.source === "pdp") {
            record(false, "pdp", outcome.decision.reasonCode, outcome.decision.decisionId);
            return deny(outcome.decision.reasonCode);
        }
        record(false, "client", outcome.reason);
        return deny(outcome.reason);
    } catch {
        return { allowed: false, message: reasonToState(DECIDE_FAILED).message };
    }
}
