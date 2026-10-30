import { NextResponse } from "next/server";

import { auth, updateServerSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getBackendUrl } from "@/lib/origin";

const routeLogger = logger.child({ module: "switch-org" });

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.access_token) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    let payload: { org_id?: unknown } | null = null;
    try {
        payload = (await request.json()) as { org_id?: unknown };
    } catch {
        payload = null;
    }
    if (!payload || typeof payload.org_id !== "string" || !payload.org_id) {
        return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
    }

    const response = await fetch(`${getBackendUrl()}/api/v1/auth/switch-org`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ org_id: payload.org_id }),
    });

    const data = await response.json().catch(() => ({ error: "Organization switch failed" }));
    if (!response.ok) {
        return NextResponse.json(data, { status: response.status });
    }

    // CHAOS-12088: the new token pair goes into the session cookie here, on the server. The
    // browser gets the active organization only, never a token.
    const pair = data as { access_token?: unknown; user?: { org_id?: unknown } } | null;
    if (typeof pair?.access_token !== "string" || !pair.access_token || !pair.user) {
        routeLogger.error(
            { status: response.status, orgId: payload.org_id },
            "switch-org answer carried no token pair; session not changed",
        );
        return NextResponse.json({ error: "Organization switch failed" }, { status: 502 });
    }
    try {
        if (!(await updateServerSession({ activeOrg: pair }))) {
            throw new Error("no session to update");
        }
    } catch (error) {
        routeLogger.error(
            { err: error, orgId: payload.org_id, userId: session.user?.id },
            "switch-org could not write the new token pair into the session",
        );
        return NextResponse.json({ error: "Organization switch failed" }, { status: 502 });
    }
    const orgId = typeof pair.user.org_id === "string" ? pair.user.org_id : payload.org_id;
    return NextResponse.json({ org_id: orgId }, { headers: { "cache-control": "no-store" } });
}
