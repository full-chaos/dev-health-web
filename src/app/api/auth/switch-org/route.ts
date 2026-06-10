import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBackendUrl } from "@/lib/origin";

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
    return NextResponse.json(data, { status: response.status });
}
