import { NextResponse } from "next/server";

import { auth, sealSessionHandoff } from "@/lib/auth";
import { servicePairFields } from "@/lib/authServicePair";
import { readExchangeAnswer, wireConfigFromEnv, wireConfigUsable } from "@/lib/authServiceWire";
import { resolveTokenClass } from "@/lib/authServiceClient";
import { serviceBearer } from "@/lib/authServiceOutcome";
import { logger } from "@/lib/logger";
import { getBackendUrl } from "@/lib/origin";

const routeLogger = logger.child({ module: "change-password" });

// The only backend refusal texts this route repeats. Everything else is answered with a fixed
// message of this route's own, so a body, a detail or a validation echo can never reach the page.
const KNOWN_REFUSALS = new Set([
    "Current password verification failed",
    "Password is managed by your sign-in provider",
]);

function genericFailure(status: number): string {
    if (status === 429) return "Too many attempts. Try again later.";
    if (status === 422) return "The new password was not accepted.";
    if (status === 401) return "Your session has expired. Sign in again.";
    return "The password could not be changed.";
}

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.access_token) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    type Payload = { current_password?: unknown; new_password?: unknown };
    let payload: Payload | null = null;
    try {
        payload = (await request.json()) as Payload;
    } catch {
        routeLogger.warn("change-password body was not JSON");
    }
    if (
        !payload ||
        typeof payload.current_password !== "string" ||
        typeof payload.new_password !== "string" ||
        !payload.current_password ||
        !payload.new_password
    ) {
        return NextResponse.json({ error: "Both passwords are required" }, { status: 400 });
    }

    // A wrong class setting is a configuration fault: refuse before any password is sent.
    const wire = wireConfigFromEnv();
    if (!wireConfigUsable(wire, "change_password")) {
        return NextResponse.json({ error: genericFailure(502) }, { status: 502 });
    }
    // The CLASS decides the Bearer, not the session: a cookie kept across a rollback to
    // hs256_compat still holds a service token, and the access token is what that class sends.
    const bearer =
        resolveTokenClass(wire.tokenClassRaw) === "eddsa"
            ? serviceBearer(session)
            : session.access_token;

    let response: Response;
    try {
        response = await fetch(`${getBackendUrl()}/api/v1/auth/change-password`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${bearer}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                current_password: payload.current_password,
                new_password: payload.new_password,
            }),
        });
    } catch {
        routeLogger.error("change-password backend unreachable");
        return NextResponse.json({ error: genericFailure(502) }, { status: 502 });
    }

    if (response.ok) {
        let data: unknown = null;
        try {
            data = await response.json();
        } catch {
            routeLogger.error("change-password success body was not JSON");
        }
        if (!data) return NextResponse.json({ error: genericFailure(502) }, { status: 502 });
        routeLogger.info({ status: response.status }, "change-password succeeded");
        // CHAOS-12088: the page gets a sealed handoff of the fresh token pair for this session (it
        // passes it to update() and cannot read it), never a token in clear. The password is
        // already changed and ops has revoked the other sessions, so a failed seal asks the user
        // to sign in again.
        const pair = data as {
            access_token?: unknown;
            refresh_token?: string;
            expires_in?: number;
            user?: { org_id?: string; role?: string; is_superuser?: boolean };
        };
        let sessionHandoff: string;
        try {
            if (typeof pair.access_token !== "string" || !pair.access_token || !pair.user) {
                throw new Error("the answer carried no token pair");
            }
            // Under eddsa the access token and the service token are read; under hs256_compat the
            // pair is what it was. A refused or unreadable answer seals nothing.
            const read = await readExchangeAnswer(
                {
                    accessToken: pair.access_token,
                    sessionAccessToken: (data as { session_access_token?: unknown })
                        .session_access_token,
                },
                wire,
                "change_password",
            );
            if (read.kind === "refused" || read.kind === "unavailable") {
                throw new Error("the answer was refused");
            }
            sessionHandoff = await sealSessionHandoff(
                "activeOrg",
                {
                    access_token: pair.access_token,
                    refresh_token: pair.refresh_token,
                    expires_in: pair.expires_in,
                    user: {
                        org_id: pair.user.org_id,
                        role: pair.user.role,
                        is_superuser: pair.user.is_superuser,
                    },
                    ...(read.kind === "read" ? servicePairFields(read) : {}),
                },
                session.user?.id ?? "",
            );
        } catch (error) {
            routeLogger.error(
                { err: error, userId: session.user?.id },
                "change-password could not seal the new token pair",
            );
            return NextResponse.json(
                { error: "Password changed. Sign in again to continue." },
                { status: 502 },
            );
        }
        return NextResponse.json(
            { ok: true, sessionHandoff },
            { status: 200, headers: { "cache-control": "no-store" } },
        );
    }

    routeLogger.warn({ status: response.status }, "change-password refused");
    let detail: unknown = null;
    try {
        detail = ((await response.json()) as { detail?: unknown } | null)?.detail;
    } catch {
        routeLogger.warn({ status: response.status }, "change-password refusal body was not JSON");
    }
    if (typeof detail === "string" && KNOWN_REFUSALS.has(detail)) {
        return NextResponse.json({ error: detail }, { status: response.status });
    }
    if (response.status === 422 && detail && typeof detail === "object") {
        const violations = (detail as { violations?: unknown }).violations;
        if (Array.isArray(violations)) {
            return NextResponse.json(
                {
                    error: genericFailure(422),
                    violations: violations.filter((v): v is string => typeof v === "string"),
                },
                { status: 422 },
            );
        }
    }
    return NextResponse.json(
        { error: genericFailure(response.status) },
        { status: response.status },
    );
}
