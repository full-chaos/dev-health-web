import type { Transport, TransportCall } from "../../authorize/client";

export const TOKEN = "tok_SECRETSECRETSECRET.abc.def";
export const ORG = "org-1";
export const USER = "user-secret-id-1";

const FUTURE = "2099-01-01T00:00:00Z";

export interface Verdict {
    allowed: boolean;
    reason: string;
}

export function batchBody(verdicts: readonly Verdict[]): string {
    return JSON.stringify({
        schema_version: "authorization_batch_response.v1",
        decisions: verdicts.map((v, index) => ({
            index,
            decision: {
                schema_version: "authorization_decision.v1",
                decision_id: `dec_EXAMPLE00000000000000${String(index).padStart(4, "0")}`,
                allowed: v.allowed,
                reason_code: v.reason,
                principal_id: "prn_EXAMPLE0000000000000001",
                organization_id: ORG,
                policy_revision: 1,
                expires_at: FUTURE,
            },
        })),
    });
}

export function recordingTransport(verdicts: readonly Verdict[]): {
    transport: Transport;
    calls: TransportCall[];
} {
    const calls: TransportCall[] = [];
    return {
        calls,
        transport: async (call) => {
            calls.push(call);
            return { status: 200, body: batchBody(verdicts) };
        },
    };
}

export const ALLOW: Verdict = { allowed: true, reason: "allowed_by_role" };
export const DENY: Verdict = { allowed: false, reason: "role_lacks_action" };

let counter = 0;
export function input(over: Record<string, unknown> = {}) {
    counter += 1;
    return {
        viewer: { isPlatformAdmin: false, role: "admin" as string | undefined },
        orgId: ORG as string | undefined,
        principalReference: TOKEN as string | undefined,
        sampleKey: `${USER}|${ORG}|test-${counter}`,
        impersonating: false,
        surfaceIds: ["guard:/org/admin"] as readonly string[],
        ...over,
    };
}
