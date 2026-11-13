import "server-only";
import { verifyCompactAccessToken, type VerifyContext } from "@/lib/auth/accesstoken/verify";

// auth-service token reading for the Auth.js adapter. EdDSA is the only access-token class: a
// token is verified against the published key set, and an HS256 token is refused as any other
// token whose header is not EdDSA.

export type AccessTokenRead =
    | {
          ok: true;
          verified: true;
          sid?: string;
          sub?: string;
          exp?: number;
          orgId?: string;
          actor?: string | null;
      }
    | { ok: false; reason: "verify" | "shape" };

export type AccessTokenOk = Extract<AccessTokenRead, { ok: true }>;

export function readAccessToken(token: string, ctx: VerifyContext): AccessTokenRead {
    const got = verifyCompactAccessToken(token, { ...ctx, audience: "dev-health-api" });
    if (!got.ok) return { ok: false, reason: "verify" };
    const { claims } = got;
    return {
        ok: true,
        verified: true,
        sid: claims.sid,
        sub: claims.sub,
        exp: claims.exp,
        ...(claims.org_id === undefined ? {} : { orgId: claims.org_id }),
        actor: got.actor,
    };
}

export type SessionAccessTokenRead =
    | { kind: "absent" }
    | { kind: "ok"; token: string; exp: number; sid: string }
    | {
          kind: "refused";
          reason: "malformed" | "verify" | "sid_mismatch" | "sub_mismatch" | "exp_mismatch";
      };

const refused = (
    reason: Extract<SessionAccessTokenRead, { kind: "refused" }>["reason"],
): SessionAccessTokenRead => ({ kind: "refused", reason });

// session_access_token (aud auth-service): when present it must verify for aud auth-service and
// carry the access token's sid and sub, and EXACTLY its exp (acp via fcsup 10-31).
export function readSessionAccessToken(
    value: unknown,
    access: AccessTokenOk,
    ctx: VerifyContext,
): SessionAccessTokenRead {
    if (value === undefined) return { kind: "absent" };
    if (typeof value !== "string" || value === "") return refused("malformed");
    const got = verifyCompactAccessToken(value, { ...ctx, audience: "auth-service" });
    if (!got.ok) return refused("verify");
    const { claims } = got;
    if (claims.sid !== access.sid) return refused("sid_mismatch");
    if (claims.sub !== access.sub) return refused("sub_mismatch");
    if (claims.exp !== access.exp) return refused("exp_mismatch");
    return { kind: "ok", token: value, exp: claims.exp, sid: claims.sid };
}
