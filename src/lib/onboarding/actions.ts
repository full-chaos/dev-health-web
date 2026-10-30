"use server";

import { isValidationStatus } from "@/lib/actionFailure";
import { AdminApiError } from "@/lib/admin/api";
import { getToken } from "@/lib/admin/server/_shared";
import { auth, sealSessionHandoff } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getBackendUrl } from "@/lib/origin";
import { deadlineFetch } from "@/lib/serverDeadline";

/**
 * CHAOS-12088: the onboarding writes run here, on the server, with the session's Ops token. Page
 * JS never holds that token; the token pair the new workspace gets reaches the page only as a
 * sealed handoff that the page passes to update() and cannot read.
 */

const log = logger.child({ module: "onboarding-actions" });

/** `status` null: no answer arrived. `detail` only for a validation answer (4xx but 401/403/429). */
export type OnboardingFailure = { ok: false; status: number | null; detail?: unknown };

export type CreateWorkspaceResult =
    { ok: true; orgId: string | null; sessionHandoff: string } | OnboardingFailure;

export type SkipIntegrationResult = { ok: true } | OnboardingFailure;

/** The session's Ops token and user id, or null when there is no usable session (getToken() refuses). */
async function sessionToken(): Promise<{ token: string; userId: string } | null> {
    try {
        const token = await getToken();
        return { token, userId: (await auth())?.user?.id ?? "" };
    } catch (error) {
        if (error instanceof AdminApiError) return null;
        throw error;
    }
}

/** Creates the signed-in user's workspace and puts its token pair into the session cookie. */
export async function createWorkspace(orgName: string): Promise<CreateWorkspaceResult> {
    const caller = await sessionToken();
    if (!caller) return { ok: false, status: 401 };

    let response: Response;
    try {
        response = await deadlineFetch("write", "onboarding create workspace")(
            `${getBackendUrl()}/api/v1/auth/onboard`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${caller.token}`,
                },
                body: JSON.stringify({
                    action: "create_org",
                    org_name: orgName || undefined,
                }),
                cache: "no-store",
            },
        );
    } catch (error) {
        log.error({ err: error }, "create workspace: the onboard call failed");
        return { ok: false, status: null };
    }

    const data = (await response.json().catch((error: unknown) => {
        log.warn(
            { err: error, status: response.status },
            "create workspace: the onboard answer was not JSON",
        );
        return null;
    })) as {
        access_token?: unknown;
        refresh_token?: unknown;
        org_id?: unknown;
        role?: unknown;
        expires_in?: unknown;
        detail?: unknown;
    } | null;
    if (!response.ok) {
        log.warn({ status: response.status }, "create workspace: the onboard call was refused");
        return isValidationStatus(response.status) && data?.detail !== undefined
            ? { ok: false, status: response.status, detail: data.detail }
            : { ok: false, status: response.status };
    }

    const orgId = typeof data?.org_id === "string" ? data.org_id : null;
    if (typeof data?.access_token !== "string" || !data.access_token) {
        log.error(
            { status: response.status, orgId },
            "create workspace: the onboard answer carried no token pair; session not changed",
        );
        return { ok: false, status: 502 };
    }
    let sessionHandoff: string;
    try {
        sessionHandoff = await sealSessionHandoff(
            "onboardComplete",
            {
                access_token: data.access_token,
                refresh_token:
                    typeof data.refresh_token === "string" ? data.refresh_token : undefined,
                org_id: orgId ?? undefined,
                role: typeof data.role === "string" ? data.role : undefined,
                expires_in: typeof data.expires_in === "number" ? data.expires_in : undefined,
            },
            caller.userId,
        );
    } catch (error) {
        // The workspace exists. The next page read routes by the backend's onboarding state.
        log.error(
            { err: error, orgId },
            "create workspace: could not seal the new token pair; session not changed",
        );
        return { ok: false, status: 502 };
    }
    return { ok: true, orgId, sessionHandoff };
}

/** Records that the signed-in user skipped the integration step. */
export async function skipIntegrationStep(): Promise<SkipIntegrationResult> {
    const caller = await sessionToken();
    if (!caller) return { ok: false, status: 401 };
    try {
        const response = await deadlineFetch("write", "onboarding skip integration")(
            `${getBackendUrl()}/api/v1/auth/onboarding/skip-integration`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${caller.token}`,
                },
                cache: "no-store",
            },
        );
        if (!response.ok) {
            log.warn({ status: response.status }, "skip integration: the call was refused");
            return { ok: false, status: response.status };
        }
        return { ok: true };
    } catch (error) {
        log.error({ err: error }, "skip integration: the call failed");
        return { ok: false, status: null };
    }
}
