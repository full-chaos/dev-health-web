import "server-only";
import { randomBytes } from "node:crypto";
import type { Session } from "next-auth";
import { processMemo } from "@/lib/processMemo";
import { authorizeBatch, type AuthzOutcome, type Transport } from "../authorize/client";
import type { AuthorizeRequest } from "../authorize/request";
import { SAMPLE_WINDOW_MS, SHADOW_TIMEOUT_MS } from "./config";
import { surfaceById, type ShadowRequestSpec, type ShadowViewer, type Surface } from "./catalog";
import { logRun, type MismatchRecord, type RunRecord, type ShadowLogger } from "./log";

// Advisory shadow of the policy decision point. It compares the verdicts the UI already acts on
// with the batch decisions and logs the difference. It returns a record for tests and callers
// discard it: nothing here changes what a page renders or whether a guard redirects.

export interface ShadowInput {
    viewer: ShadowViewer;
    orgId: string | undefined;
    principalReference: string | undefined;
    sampleKey: string;
    impersonating: boolean;
    surfaceIds: readonly string[];
}

export interface ShadowDeps {
    transport: Transport | undefined;
    log?: ShadowLogger;
    nowMs?: () => number;
}

export type ShadowResult =
    | {
          status: "skipped";
          reason: "no_transport" | "impersonating" | "no_scope" | "sampled" | "error";
      }
    | { status: "ran"; record: RunRecord };

const sampleMemo = processMemo<number>("authzShadowSample");
const SAMPLE_MEMO_MAX = 1000;

function sampled(key: string, now: number): boolean {
    const until = sampleMemo.get(key);
    if (until !== undefined && until > now) return true;
    if (sampleMemo.size >= SAMPLE_MEMO_MAX) {
        for (const [k, v] of sampleMemo) if (v <= now) sampleMemo.delete(k);
        if (sampleMemo.size >= SAMPLE_MEMO_MAX) sampleMemo.clear();
    }
    sampleMemo.set(key, now + SAMPLE_WINDOW_MS);
    return false;
}

const newRequestId = (): string => `req_${randomBytes(20).toString("base64url").slice(0, 26)}`;

export function shadowViewerFrom(session: Session): ShadowViewer {
    return { isPlatformAdmin: session.user.is_superuser === true, role: session.user.role };
}

export function shadowInputFrom(session: Session, surfaceIds: readonly string[]): ShadowInput {
    return {
        viewer: shadowViewerFrom(session),
        orgId: session.user.org_id,
        principalReference: session.access_token,
        sampleKey: `${session.user.id}|${session.user.org_id ?? ""}|${surfaceIds.join(",")}`,
        impersonating: session.user.is_impersonating === true,
        surfaceIds,
    };
}

interface Asked {
    surface: Surface;
    clientAllowed: boolean;
    request: AuthorizeRequest;
}

function classify(
    clientAllowed: boolean,
    outcome: AuthzOutcome,
): "match" | "mismatch" | "unavailable" {
    if (!outcome.allowed && outcome.source === "client") return "unavailable";
    return outcome.allowed === clientAllowed ? "match" : "mismatch";
}

export function buildShadowRequest(
    spec: ShadowRequestSpec,
    scope: { orgId: string | undefined; principalReference: string; requestId: string },
): AuthorizeRequest | null {
    const base = { principalReference: scope.principalReference, action: spec.action };
    if (spec.resource === "platform") {
        return {
            ...base,
            resource: { type: "platform", key: "platform" },
            requestId: scope.requestId,
        };
    }
    if (!scope.orgId) return null;
    return {
        ...base,
        resource: { type: "organization", key: scope.orgId, organizationId: scope.orgId },
        requestId: scope.requestId,
    };
}

export async function shadowDecide(input: ShadowInput, deps: ShadowDeps): Promise<ShadowResult> {
    try {
        const { transport } = deps;
        if (!transport) return { status: "skipped", reason: "no_transport" };
        if (input.impersonating) return { status: "skipped", reason: "impersonating" };
        if (!input.principalReference) {
            return { status: "skipped", reason: "no_scope" };
        }
        if (sampled(input.sampleKey, (deps.nowMs ?? Date.now)())) {
            return { status: "skipped", reason: "sampled" };
        }

        const counts = { match: 0, mismatch: 0, unavailable: 0, no_action: 0 };
        const asked: Asked[] = [];
        const ids: string[] = [];
        for (const id of input.surfaceIds) {
            const surface = surfaceById(id);
            if (!surface) continue;
            ids.push(id);
            if (!surface.request) {
                counts.no_action += 1;
                continue;
            }
            const request = buildShadowRequest(surface.request, {
                orgId: input.orgId,
                principalReference: input.principalReference,
                requestId: newRequestId(),
            });
            if (!request) {
                counts.no_action += 1;
                continue;
            }
            asked.push({ surface, clientAllowed: surface.clientAllowed(input.viewer), request });
        }

        const mismatches: MismatchRecord[] = [];
        if (asked.length > 0) {
            const outcomes = await authorizeBatch(
                asked.map((a) => a.request),
                { transport, timeoutMs: SHADOW_TIMEOUT_MS, nowMs: deps.nowMs },
            );
            asked.forEach((a, index) => {
                const outcome = outcomes[index];
                if (!outcome) {
                    counts.unavailable += 1;
                    return;
                }
                const verdict = classify(a.clientAllowed, outcome);
                counts[verdict] += 1;
                if (verdict === "mismatch" && "decision" in outcome) {
                    mismatches.push({
                        surface: a.surface.id,
                        action: a.request.action,
                        clientAllowed: a.clientAllowed,
                        decisionAllowed: outcome.allowed,
                        reasonCode: outcome.decision.reasonCode,
                        decisionId: outcome.decision.decisionId,
                        requestId: a.request.requestId,
                    });
                }
            });
        }

        const record: RunRecord = { counts, surfaces: ids, mismatches };
        logRun(record, deps.log);
        return { status: "ran", record };
    } catch {
        return { status: "skipped", reason: "error" };
    }
}
