import type { Session } from "next-auth";
import type { Transport, TransportCall } from "../../authorize/client";

export const TOKEN = "tok-SECRETSECRETSECRET.abc.def";
export const ORG = "org-1";
export const USER = "user-secret-id-1";

export interface Verdict {
    allowed: boolean;
    reason: string;
    expiresAt?: string;
}

export const ALLOW: Verdict = { allowed: true, reason: "allowed_by_role" };
export const DENY: Verdict = { allowed: false, reason: "role_lacks_action" };

export function decisionBody(v: Verdict, orgId: string | null = ORG): string {
    return JSON.stringify({
        schema_version: "authorization_decision.v1",
        decision_id: "dec_EXAMPLE0000000000000000001",
        allowed: v.allowed,
        reason_code: v.reason,
        principal_id: "prn_EXAMPLE0000000000000001",
        organization_id: orgId,
        policy_revision: 1,
        expires_at: v.expiresAt ?? "2099-01-01T00:00:00Z",
    });
}

export function recordingTransport(
    reply: (call: TransportCall) => Promise<{ status: number; body: string }>,
): { transport: Transport; calls: TransportCall[] } {
    const calls: TransportCall[] = [];
    return {
        calls,
        transport: async (call) => {
            calls.push(call);
            return reply(call);
        },
    };
}

export const answering = (v: Verdict) =>
    recordingTransport(async (call) => {
        const body = JSON.parse(call.body) as { resource: { organization_id?: string } };
        return {
            status: 200,
            body: decisionBody(v, body.resource.organization_id ?? null),
        };
    });

export interface UserOver {
    is_superuser?: boolean;
    role?: string;
    org_id?: string | null;
    is_impersonating?: boolean;
}

export function session(over: UserOver = {}, token: string | null = TOKEN): Session {
    return {
        user: {
            id: USER,
            org_id: ORG,
            role: "member",
            is_superuser: false,
            is_impersonating: false,
            ...over,
        },
        access_token: token ?? undefined,
        expires: "2099-01-01",
    } as unknown as Session;
}

// A session whose legacy fields count every read: a cell that must not consult a client array
// reads `reads()` afterwards.
export function countingSession(over: UserOver = {}): { session: Session; reads: () => number } {
    let n = 0;
    const base = session(over);
    const user = { ...base.user } as Record<string, unknown>;
    const counted = { ...user };
    for (const key of ["is_superuser", "role"]) {
        delete counted[key];
        Object.defineProperty(counted, key, {
            enumerable: true,
            get() {
                n += 1;
                return user[key];
            },
        });
    }
    return { session: { ...base, user: counted } as unknown as Session, reads: () => n };
}
