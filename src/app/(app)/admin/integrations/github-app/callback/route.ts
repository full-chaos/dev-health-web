import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { getBackendUrl } from "@/lib/origin";

/**
 * Setup-URL callback for the frictionless GitHub App install (CHAOS-2235).
 *
 * GitHub redirects here after the user installs/authorizes the App, passing
 * `installation_id`, `setup_action`, `state`, and optionally `code` as query
 * params. All of these are attacker-influenceable, so we validate types before
 * forwarding them to the backend, which verifies the signed `state`, the
 * installation, and the org binding. We then redirect back to the integration
 * page with a fixed success/error indicator and never surface the raw access
 * token or backend error internals to the client.
 */

const GITHUB_INTEGRATION_PATH = "/admin/integrations/github";

function resultRedirect(request: NextRequest, result: "connected" | "error") {
    return NextResponse.redirect(
        new URL(`${GITHUB_INTEGRATION_PATH}?github_app=${result}`, request.url),
    );
}

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;

    const rawInstallationId = params.get("installation_id");
    const state = params.get("state");
    const setupAction = params.get("setup_action");
    const code = params.get("code");

    // Validate the untrusted GitHub-supplied params before doing any work.
    // Reject values that exceed MAX_SAFE_INTEGER so large IDs don't silently
    // lose precision before being forwarded to the backend.
    const installationId =
        rawInstallationId && /^\d+$/.test(rawInstallationId) ? Number(rawInstallationId) : NaN;
    if (
        !Number.isInteger(installationId) ||
        installationId <= 0 ||
        installationId > Number.MAX_SAFE_INTEGER ||
        !state
    ) {
        return resultRedirect(request, "error");
    }

    const session = await auth();
    if (!session?.access_token) {
        // GET is followed by the browser, so render an error banner rather than
        // raw JSON.
        return resultRedirect(request, "error");
    }

    // Defense-in-depth: this route is directly addressable and does not sit
    // under the admin layout's requireRole guard. Mirror requireRole(["admin",
    // "owner"]) inline (do NOT call it — it redirects to /dashboard, breaking
    // this handler's consistent ?github_app=error UX).
    if (!session.user.is_superuser && !["admin", "owner"].includes(session.user.role || "")) {
        return resultRedirect(request, "error");
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

    try {
        const response = await fetch(
            `${getBackendUrl()}/api/v1/admin/integrations/github/install-callback`,
            {
                method: "POST",
                headers,
                body: JSON.stringify({
                    installation_id: installationId,
                    setup_action: setupAction,
                    state,
                    code,
                }),
            },
        );

        return resultRedirect(request, response.ok ? "connected" : "error");
    } catch {
        return resultRedirect(request, "error");
    }
}
