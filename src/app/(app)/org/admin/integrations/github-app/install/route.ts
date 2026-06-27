import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { getServerEnv } from "@/lib/config";
import { getBackendUrl } from "@/lib/origin";
import { safeReturnTo } from "@/lib/onboarding/returnTo";

/**
 * Initiation route for the frictionless GitHub App install (CHAOS-2235).
 *
 * CHAOS-2676 (C4): an optional `return_to` query param is forwarded to the
 * backend so the post-install callback can land the user on a validated
 * destination (e.g. the first-run sync surface). Only same-origin relative
 * paths are forwarded; the backend re-validates and bakes it into the state
 * JWT.
 *
 * The browser navigates here from the "Connect GitHub App" CTA on the GitHub
 * integration page. We ask the backend to mint a signed install URL (the state
 * JWT is created server-side) and redirect the browser to GitHub. On any
 * backend failure we send the user back to the integration page with an error
 * indicator rather than leaking backend internals.
 */

const GITHUB_INTEGRATION_PATH = "/org/admin/integrations/github";

// `safeReturnTo` (shared, hardened) lives in `@/lib/onboarding/returnTo`.
function firstHeaderValue(value: string | null) {
    return value?.split(",")[0]?.trim() || undefined;
}

function configuredOrigin() {
    const env = getServerEnv();
    const publicUrl = env.AUTH_URL ?? env.NEXTAUTH_URL;
    if (!publicUrl) return undefined;

    try {
        return new URL(publicUrl).origin;
    } catch {
        return undefined;
    }
}

function publicOrigin(request: NextRequest) {
    const configured = configuredOrigin();
    if (configured) {
        return configured;
    }

    const env = getServerEnv();
    if (env.TRUST_PROXY !== "true" && env.TRUST_PROXY !== "1") {
        return request.nextUrl.origin;
    }

    const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
    if (!forwardedHost) {
        return request.nextUrl.origin;
    }

    const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
    const protocol =
        forwardedProto === "http" || forwardedProto === "https"
            ? forwardedProto
            : request.nextUrl.protocol.slice(0, -1);

    return `${protocol}://${forwardedHost}`;
}

function errorRedirect(request: NextRequest) {
    return NextResponse.redirect(
        new URL(`${GITHUB_INTEGRATION_PATH}?github_app=error`, publicOrigin(request)),
    );
}

export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.access_token) {
        // GET is followed by the browser, so render an error banner rather than
        // raw JSON.
        return errorRedirect(request);
    }

    // Defense-in-depth: this route is directly addressable and does not sit
    // under the admin layout's requireRole guard. Mirror requireRole(["admin",
    // "owner"]) inline (do NOT call it — it redirects to /dashboard, breaking
    // this handler's consistent ?github_app=error UX).
    if (!session.user.is_superuser && !["admin", "owner"].includes(session.user.role || "")) {
        return errorRedirect(request);
    }

    const headers: Record<string, string> = {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
    };
    // Forward the effective org so impersonation/active-org binds the install
    // to the correct organization (mirrors src/lib/admin/server helpers).
    if (session.user?.org_id) {
        headers["X-Org-Id"] = session.user.org_id;
    }

    const returnTo = safeReturnTo(request.nextUrl.searchParams.get("return_to"));
    let installUrl: string | undefined;
    try {
        const response = await fetch(
            `${getBackendUrl()}/api/v1/admin/integrations/github/install-url`,
            {
                method: "POST",
                headers,
                ...(returnTo ? { body: JSON.stringify({ return_to: returnTo }) } : {}),
            },
        );

        if (!response.ok) {
            return errorRedirect(request);
        }

        const data = (await response.json()) as { install_url?: unknown };
        installUrl = typeof data.install_url === "string" ? data.install_url : undefined;
    } catch {
        return errorRedirect(request);
    }

    // The install URL is minted by our own backend, but validate it before
    // redirecting so a malformed/compromised response can never become an
    // open redirect. Pin to https on github.com (GitHub App install host).
    // GitHub Enterprise host support is a future follow-up.
    if (!installUrl) {
        return errorRedirect(request);
    }
    let parsed: URL;
    try {
        parsed = new URL(installUrl);
    } catch {
        return errorRedirect(request);
    }
    if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
        return errorRedirect(request);
    }

    return NextResponse.redirect(parsed.toString());
}
