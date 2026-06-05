import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getBackendUrl } from "@/lib/origin";

export async function GET() {
    const session = await auth();
    if (!session?.access_token) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const response = await fetch(`${getBackendUrl()}/api/v1/auth/me/organizations`, {
        headers: {
            Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
    });

    const data = await response.json().catch(() => ({ error: "Organization lookup failed" }));
    return NextResponse.json(data, { status: response.status });
}
