import "server-only";
import type { ExchangeRead } from "@/lib/authServiceWire";

// The fields a handoff pair carries from a read answer under eddsa: the verified access expiry and
// session id, the verified actor, and the service token with its expiry. A field the answer did not
// have is absent from the pair (the apply step clears the stored ones).
export function servicePairFields(read: Extract<ExchangeRead, { kind: "read" }>): {
    access_exp?: number;
    sid?: string;
    act_sub?: string;
    session_access_token?: string;
    session_exp?: number;
} {
    return {
        ...(read.accessExp === undefined ? {} : { access_exp: read.accessExp }),
        ...(read.sid === undefined ? {} : { sid: read.sid }),
        ...(typeof read.actor === "string" ? { act_sub: read.actor } : {}),
        ...(read.session.kind === "ok"
            ? { session_access_token: read.session.token, session_exp: read.session.exp }
            : {}),
    };
}
