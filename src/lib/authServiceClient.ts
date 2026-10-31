import "server-only";
import { parseStrictJson } from "@/lib/auth/accesstoken/strictjson";
import { verifyCompactAccessToken, type VerifyContext } from "@/lib/auth/accesstoken/verify";

// auth-service token reading for the Auth.js adapter (CHAOS-10876, PR-A: not wired).
// The expected token class is server config, never the token header. Under hs256_compat
// web holds no HS256 secret: exp and sid are read by decode and marked NOT VERIFIED.

export type TokenClass = "eddsa" | "hs256_compat";

// AUTH_ACCESS_TOKEN_CLASS: unset or empty = hs256_compat (auth-service's default); any
// other value outside the closed set is refused (null).
export function resolveTokenClass(raw: string | undefined): TokenClass | null {
    if (raw === undefined || raw === "") return "hs256_compat";
    return raw === "eddsa" || raw === "hs256_compat" ? raw : null;
}

export type AccessTokenRead =
    | {
          ok: true;
          verified: boolean;
          sid?: string;
          sub?: string;
          exp?: number;
          orgId?: string;
          actor?: string | null;
      }
    | { ok: false; reason: "verify" | "shape" };

export type AccessTokenOk = Extract<AccessTokenRead, { ok: true }>;

const B64URL = /^[A-Za-z0-9_-]+$/;

function decodeSegment(segment: string | undefined): unknown {
    if (segment === undefined || !B64URL.test(segment)) return undefined;
    try {
        return parseStrictJson(
            new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(segment, "base64url")),
        );
    } catch {
        return undefined;
    }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

// aud is a closed shape in a decoded token: absent, a string, or an array of strings. A service
// token (aud auth-service, alone or in any array position) and any other shape are refused.
function audRefused(aud: unknown): boolean {
    if (aud === undefined) return false;
    if (typeof aud === "string") return aud === "auth-service";
    if (!Array.isArray(aud)) return true;
    return aud.some((member) => typeof member !== "string" || member === "auth-service");
}

// NOT VERIFIED: a decode of the payload, no signature check. The header alg is read only to
// refuse a token of the other class; aud is read only to refuse a service token.
function decodeHs256(token: string): AccessTokenRead {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, reason: "shape" };
    const header = decodeSegment(parts[0]);
    const payload = decodeSegment(parts[1]);
    if (!isObject(header) || header.alg !== "HS256" || !isObject(payload)) {
        return { ok: false, reason: "shape" };
    }
    if (audRefused(payload.aud)) return { ok: false, reason: "shape" };
    const { exp, sid } = payload;
    return {
        ok: true,
        verified: false,
        ...(typeof sid === "string" && sid !== "" ? { sid } : {}),
        ...(typeof exp === "number" && Number.isInteger(exp) && exp > 0 ? { exp } : {}),
    };
}

export function readAccessToken(
    token: string,
    tokenClass: TokenClass,
    ctx: VerifyContext,
): AccessTokenRead {
    if (tokenClass === "hs256_compat") return decodeHs256(token);
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
    | { kind: "ignored" }
    | { kind: "ok"; token: string; exp: number; sid: string }
    | {
          kind: "refused";
          reason: "malformed" | "verify" | "sid_mismatch" | "sub_mismatch" | "exp_mismatch";
      };

const refused = (
    reason: Extract<SessionAccessTokenRead, { kind: "refused" }>["reason"],
): SessionAccessTokenRead => ({ kind: "refused", reason });

// session_access_token (aud auth-service): present only under eddsa. Under hs256_compat it is
// ignored and never stored. Under eddsa it must verify for aud auth-service and carry the access
// token's sid and sub, and EXACTLY its exp (acp via fcsup 10-31).
export function readSessionAccessToken(
    value: unknown,
    access: AccessTokenOk,
    tokenClass: TokenClass,
    ctx: VerifyContext,
): SessionAccessTokenRead {
    if (value === undefined) return { kind: "absent" };
    if (tokenClass === "hs256_compat") return { kind: "ignored" };
    if (typeof value !== "string" || value === "") return refused("malformed");
    const got = verifyCompactAccessToken(value, { ...ctx, audience: "auth-service" });
    if (!got.ok) return refused("verify");
    const { claims } = got;
    if (claims.sid !== access.sid) return refused("sid_mismatch");
    if (claims.sub !== access.sub) return refused("sub_mismatch");
    if (claims.exp !== access.exp) return refused("exp_mismatch");
    return { kind: "ok", token: value, exp: claims.exp, sid: claims.sid };
}
