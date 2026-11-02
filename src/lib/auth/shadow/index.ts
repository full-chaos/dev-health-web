import "server-only";
import { after } from "next/server";
import type { Session } from "next-auth";
import { getServerEnv } from "@/lib/config";
import { getShadowTransport, shadowEnabled } from "./config";
import { shadowDecide, shadowInputFrom } from "./run";

// The one call a layout makes. It returns at once: the decision work runs after the response, and
// nothing in here can throw into the render. Off by default and a no-op without a transport.
export function scheduleShadow(session: Session, surfaceIds: readonly string[]): void {
    try {
        if (!shadowEnabled(getServerEnv().AUTHZ_SHADOW_NAV)) return;
        const transport = getShadowTransport();
        if (!transport) return;
        const input = shadowInputFrom(session, surfaceIds);
        after(() => shadowDecide({ ...input }, { transport }).then(() => undefined));
    } catch {
        // advisory only
    }
}
