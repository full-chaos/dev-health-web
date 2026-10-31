import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getBackendUrl } from "@/lib/origin";

const routeLogger = logger.child({ module: "organizations" });

/** The organization fields the switcher shows. Nothing else of the backend answer is served. */
const ORGANIZATION_FIELDS = [
    "id",
    "slug",
    "name",
    "tier",
    "role",
    "joined_at",
    "has_data",
    "last_metrics_at",
] as const;

function pickOrganization(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const field of ORGANIZATION_FIELDS) {
        if (field in source) picked[field] = source[field];
    }
    return picked;
}

export async function GET() {
    const session = await auth();
    if (!session?.access_token) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    let response: Response;
    try {
        response = await fetch(`${getBackendUrl()}/api/v1/auth/me/organizations`, {
            headers: {
                Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
        });
    } catch (error) {
        routeLogger.error({ err: error }, "organization lookup backend call failed");
        return NextResponse.json({ error: "Organization lookup failed" }, { status: 502 });
    }

    // CHAOS-12088: the page gets the named fields only, never a backend body as it came.
    if (!response.ok) {
        routeLogger.warn({ status: response.status }, "organization lookup refused by the backend");
        return NextResponse.json(
            { error: "Organization lookup failed" },
            { status: response.status },
        );
    }
    const data = (await response.json().catch((error: unknown) => {
        routeLogger.error(
            { err: error, status: response.status },
            "organization lookup answer was not JSON",
        );
        return null;
    })) as { active_org_id?: unknown; organizations?: unknown } | null;
    if (!data || !Array.isArray(data.organizations)) {
        return NextResponse.json({ error: "Organization lookup failed" }, { status: 502 });
    }
    return NextResponse.json({
        active_org_id: typeof data.active_org_id === "string" ? data.active_org_id : null,
        organizations: data.organizations
            .map(pickOrganization)
            .filter((org): org is Record<string, unknown> => org !== null),
    });
}
