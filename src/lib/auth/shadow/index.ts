import "server-only";
import { after } from "next/server";
import type { Session } from "next-auth";
import { getServerEnv } from "@/lib/config";
import { getShadowTransport, shadowEnabled } from "./config";
import type { Surface } from "./catalog";
import { shadowDecide, shadowInputFrom } from "./run";

type ServerEnv = ReturnType<typeof getServerEnv>;
type StringEnvKey = {
    [K in keyof ServerEnv]-?: ServerEnv[K] extends string | undefined ? K : never;
}[keyof ServerEnv];

export interface ScheduleShadowOptions {
    surfaces?: readonly Surface[];
    includeImpersonating?: boolean;
    switch?: { name: StringEnvKey; onValue: string };
}

const DEFAULT_SWITCH = { name: "AUTHZ_SHADOW_NAV", onValue: "on" } as const;

// The one call a layout makes. It returns at once: the decision work runs after the response, and
// nothing in here can throw into the render. Off by default and a no-op without a transport.
export function scheduleShadow(
    session: Session,
    surfaceIds: readonly string[],
    opts?: ScheduleShadowOptions,
): void {
    try {
        const sw = opts?.switch ?? DEFAULT_SWITCH;
        if (!shadowEnabled(getServerEnv()[sw.name], sw.onValue)) return;
        const transport = getShadowTransport();
        if (!transport) return;
        const input = shadowInputFrom(session, surfaceIds, opts);
        after(() => shadowDecide({ ...input }, { transport }).then(() => undefined));
    } catch {
        // advisory only
    }
}
