import "server-only";
import type { Session } from "next-auth";
import type { Surface } from "../shadow/catalog";
import { scheduleShadow } from "../shadow";
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

export function schedulePlatformShadow(
    session: Session,
    surfaceIds: readonly string[],
    extra: readonly Surface[] = [],
): void {
    scheduleShadow(session, surfaceIds, {
        surfaces: [...PLATFORM_SHADOW_ROWS, ...extra],
        includeImpersonating: true,
        switch: PLATFORM_UI_SWITCH,
    });
}

export function scheduleFnShadow(
    session: Session,
    action: PlatformAction,
    allowImpersonating: boolean,
): void {
    const surface = fnSurface(action, allowImpersonating);
    schedulePlatformShadow(session, [surface.id], [surface]);
}
