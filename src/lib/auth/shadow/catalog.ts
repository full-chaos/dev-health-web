import "server-only";
import { isNavChildVisible, navAreas, type NavChildRoute } from "@/lib/navigation/areas";

// The closed table of surfaces the shadow compares. A row with a `request` is asked of the policy
// decision point; a row without one has no low-risk catalog action and is only counted. Platform
// rows stay unmapped: their only actions (admin.users, admin.orgs) are high risk, and a high-risk
// decision writes an audit row per call.

export interface ShadowViewer {
    isPlatformAdmin: boolean;
    role: string | undefined;
}

export interface ShadowRequestSpec {
    action: string;
    resource: "organization";
}

export interface Surface {
    id: string;
    clientAllowed: (viewer: ShadowViewer) => boolean;
    request: ShadowRequestSpec | null;
}

// Same lists as the guard calls of the layouts; catalog.test.ts reads the layout
// sources and fails when either side moves.
export const ORG_ADMIN_ROLES = ["admin", "owner"] as const;
export const DATA_HEALTH_ROLES = ["admin", "owner", "operator"] as const;

function navChild(id: string): NavChildRoute {
    for (const area of navAreas) {
        const hit = area.children.find((child) => child.id === id);
        if (hit) return hit;
    }
    throw new Error(`shadow catalog: no navigation child ${id}`);
}

const navRow = (id: string): Surface => ({
    id: `nav:${id}`,
    clientAllowed: (viewer) =>
        isNavChildVisible(navChild(id), {}, { isPlatformAdmin: viewer.isPlatformAdmin }),
    request: null,
});

const roleList = (viewer: ShadowViewer, roles: readonly string[]): boolean =>
    viewer.isPlatformAdmin || roles.includes(viewer.role ?? "");

export const SURFACES: readonly Surface[] = [
    navRow("platform"),
    navRow("platform-billing"),
    {
        id: "guard:/org/admin",
        clientAllowed: (viewer) => roleList(viewer, ORG_ADMIN_ROLES),
        request: { action: "integrations.read", resource: "organization" },
    },
    {
        id: "guard:/superadmin",
        clientAllowed: (viewer) => viewer.isPlatformAdmin,
        request: null,
    },
    {
        id: "guard:/data-health",
        clientAllowed: (viewer) => roleList(viewer, DATA_HEALTH_ROLES),
        request: null,
    },
];

export type SurfaceId = (typeof SURFACES)[number]["id"];

export function surfaceById(id: string): Surface | undefined {
    return SURFACES.find((s) => s.id === id);
}
