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

interface PendingBatch {
    session: Session;
    ids: Set<string>;
    extra: Map<string, Surface>;
}

// One render asks for its nav rows, page row, control row and fn rows in separate calls. They join
// one batch per user and organisation, flushed once after the response, so the decision point sees
// one request and the audit window counts one run. A flush that starts removes its batch first, so
// a later render opens a new one.
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
        if (open) {
            for (const id of surfaceIds) open.ids.add(id);
            for (const surface of extra) open.extra.set(surface.id, surface);
            return;
        }
        const batch: PendingBatch = {
            session,
            ids: new Set(surfaceIds),
            extra: new Map(extra.map((surface) => [surface.id, surface])),
        };
        after(() => {
            pending.delete(key);
            const input = shadowInputFrom(batch.session, [...batch.ids], {
                surfaces: [...PLATFORM_SHADOW_ROWS, ...batch.extra.values()],
                includeImpersonating: true,
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
