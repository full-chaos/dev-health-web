import { NextResponse } from "next/server";

import { auth, sealSessionHandoff } from "@/lib/auth";
import { servicePairFields } from "@/lib/authServicePair";
import { logger } from "@/lib/logger";
import { readExchangeAnswer, wireConfigFromEnv, wireConfigUsable } from "@/lib/authServiceWire";
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

    // A wrong class setting is a configuration fault: refuse before the backend mints anything.
    const wire = wireConfigFromEnv();
    if (!wireConfigUsable(wire, "switch_org")) {
        return NextResponse.json({ error: "Organization switch failed" }, { status: 502 });
    }

    let response: Response;
    try {
        response = await fetch(`${getBackendUrl()}/api/v1/auth/switch-org`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ org_id: payload.org_id }),
        });
    } catch (error) {
        routeLogger.error({ err: error, orgId: payload.org_id }, "switch-org backend call failed");
        return NextResponse.json({ error: "Organization switch failed" }, { status: 502 });
    }

    if (!response.ok) {
        // A fixed answer: no backend body reaches the page (CHAOS-12088).
        routeLogger.warn(
            { status: response.status, orgId: payload.org_id },
            "switch-org refused by the backend",
        );
        return NextResponse.json(
            { error: "Organization switch failed" },
            { status: response.status },
        );
    }
    const data: unknown = await response.json().catch((error: unknown) => {
        routeLogger.error(
            { err: error, status: response.status, orgId: payload.org_id },
            "switch-org answer was not JSON",
        );
        return null;
    });

    // CHAOS-12088: the page gets the active organization and a sealed handoff of the new token
    // pair (it passes the handoff to update() and cannot read it), never a token in clear.
    const pair = data as {
        access_token?: unknown;
        refresh_token?: string;
        expires_in?: number;
        user?: { org_id?: unknown; role?: string; is_superuser?: boolean };
    } | null;
    if (typeof pair?.access_token !== "string" || !pair.access_token || !pair.user) {
        routeLogger.error(
            { status: response.status, orgId: payload.org_id },
            "switch-org answer carried no token pair; session not changed",
        );
        return NextResponse.json({ error: "Organization switch failed" }, { status: 502 });
    }
    const orgId = typeof pair.user.org_id === "string" ? pair.user.org_id : payload.org_id;
    // Under eddsa the access token and the service token are read; under hs256_compat the pair is
    // exactly what it was. A refused or unreadable answer leaves the session as it is.
    const read = await readExchangeAnswer(
        {
            accessToken: pair.access_token,
            sessionAccessToken: (data as { session_access_token?: unknown }).session_access_token,
        },
        wire,
        "switch_org",
    );
    if (read.kind === "refused" || read.kind === "unavailable") {
        routeLogger.error(
            { status: response.status, orgId: payload.org_id },
            "switch-org answer was refused; session not changed",
        );
        return NextResponse.json({ error: "Organization switch failed" }, { status: 502 });
    }
    let sessionHandoff: string;
    try {
        sessionHandoff = await sealSessionHandoff(
            "activeOrg",
            {
                access_token: pair.access_token,
                refresh_token: pair.refresh_token,
                expires_in: pair.expires_in,
                user: { org_id: orgId, role: pair.user.role, is_superuser: pair.user.is_superuser },
                ...(read.kind === "read" ? servicePairFields(read) : {}),
            },
            session.user?.id ?? "",
        );
    } catch (error) {
        routeLogger.error(
            { err: error, orgId: payload.org_id, userId: session.user?.id },
            "switch-org could not seal the new token pair",
        );
        return NextResponse.json({ error: "Organization switch failed" }, { status: 502 });
    }
    return NextResponse.json(
        { org_id: orgId, sessionHandoff },
        { headers: { "cache-control": "no-store" } },
    );
}
