import "server-only";
import type { Session } from "next-auth";
import { after } from "next/server";
import type { Surface } from "../shadow/catalog";
import { getServerEnv } from "@/lib/config";
import { getShadowTransport, shadowEnabled } from "../shadow/config";
import { shadowDecide, shadowInputFrom } from "../shadow/run";
import {
    PLATFORM_ACTIONS,
    PLATFORM_SURFACES,
    type PlatformAction,
    type PlatformSurface,
} from "./actionTable";
import { PLATFORM_UI_SWITCH } from "./mode";

// Shadow rows for the platform-admin UI. The verdict is the policy decision for the table action
// on the platform resource; the client side is what the UI does today. Nothing here changes what
// a page renders or whether a guard redirects.

const isPlatformAction = (a: string): a is PlatformAction =>
    (PLATFORM_ACTIONS as readonly string[]).includes(a);

// Today: a guard page refuses an impersonating session; a nav row and a control are shown to any
// superuser, impersonating or not.
function clientAllowedFor(kind: PlatformSurface["kind"]): Surface["clientAllowed"] {
    return kind === "page"
        ? (viewer) => viewer.isPlatformAdmin && !viewer.isImpersonating
        : (viewer) => viewer.isPlatformAdmin;
}

export const PLATFORM_SHADOW_ROWS: readonly Surface[] = PLATFORM_SURFACES.flatMap((row) =>
    (row.kind === "page" || row.kind === "nav" || row.kind === "control") &&
    isPlatformAction(row.action)
        ? [
              {
                  id: row.id,
                  clientAllowed: clientAllowedFor(row.kind),
                  request: { action: row.action, resource: "platform" as const },
              },
          ]
        : [],
);

export function fnSurface(action: PlatformAction, allowImpersonating: boolean): Surface {
    return {
        id: `fn:${action}${allowImpersonating ? ":impersonation-allowed" : ""}`,
        clientAllowed: (viewer) =>
            viewer.isPlatformAdmin && (allowImpersonating || !viewer.isImpersonating),
        request: { action, resource: "platform" },
    };
}

interface PendingCall {
    ids: readonly string[];
    extra: readonly Surface[];
}

interface PendingBatch {
    session: Session;
    calls: PendingCall[];
}

// One render asks for its nav rows, page row, control row and fn rows in separate calls. They join
// one batch per user and organisation, flushed once after the response, so the decision point sees
// one request and the audit window counts one run. Each call keeps its own surface set and is
// sampled on its own, so overlapping renders merged into one batch still hold each set they asked.
// A flush that starts removes its batch first, so a later render opens a new one.
const pending = new Map<string, PendingBatch>();

export function schedulePlatformShadow(
    session: Session,
    surfaceIds: readonly string[],
    extra: readonly Surface[] = [],
): void {
    try {
        if (!shadowEnabled(getServerEnv()[PLATFORM_UI_SWITCH.name], PLATFORM_UI_SWITCH.onValue)) {
            return;
        }
        const transport = getShadowTransport();
        if (!transport) return;
        const key = `${session.user.id}|${session.user.org_id ?? ""}|${session.user.is_impersonating === true}`;
        const open = pending.get(key);
        const call: PendingCall = { ids: [...surfaceIds], extra: [...extra] };
        if (open) {
            open.calls.push(call);
            return;
        }
        const batch: PendingBatch = { session, calls: [call] };
        after(() => {
            pending.delete(key);
            const ids = new Set(batch.calls.flatMap((c) => c.ids));
            const extras = new Map(batch.calls.flatMap((c) => c.extra.map((s) => [s.id, s])));
            const input = shadowInputFrom(batch.session, [...ids], {
                surfaces: [...PLATFORM_SHADOW_ROWS, ...extras.values()],
                includeImpersonating: true,
                sampleGroups: batch.calls.map((c) => c.ids),
            });
            return shadowDecide(input, { transport }).then(() => undefined);
        });
        pending.set(key, batch);
    } catch {
        // advisory only
    }
}

export function scheduleFnShadow(
    session: Session,
    action: PlatformAction,
    allowImpersonating: boolean,
): void {
    try {
        const surface = fnSurface(action, allowImpersonating);
        schedulePlatformShadow(session, [surface.id], [surface]);
    } catch {
        // advisory only: a shadow failure never changes the enforced verdict
    }
}
