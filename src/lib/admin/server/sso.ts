"use server";

import { failureFromError } from "@/lib/actionFailure";
import { selfRequest } from "../api/_request";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/result";
import type {
    SsoProvider,
    SsoProviderCreate,
    SsoProviderListResponse,
    SsoProviderUpdate,
} from "../types";
import { getSessionContext } from "./_shared";

// ---- SSO providers: go-api /api/v1/auth/sso/providers (CHAOS-13638) ----
// The routes are under /api/v1/auth/sso, not /api/v1/admin, so these calls use selfRequest. Every
// write names the ops action sso.write: an impersonating session is refused before the call. Every
// result carries `status` on failure, so the page tells a plan gate (402), a refused write (403) and
// an unavailable service (503) apart from a plain failure.

async function withStatus<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
    try {
        return { data: await fn() };
    } catch (err) {
        return failureFromError("ssoProviders", err);
    }
}

export async function listSsoProviders(
    limit?: number,
    offset?: number,
): Promise<ActionResult<SsoProviderListResponse>> {
    return withStatus(async () => {
        const { token, orgId } = await getSessionContext();
        return selfRequest<SsoProviderListResponse>(
            `/auth/sso/providers?limit=${limit ?? 50}&offset=${offset ?? 0}`,
            {},
            token,
            orgId,
        );
    });
}

export async function createSsoProvider(
    data: SsoProviderCreate,
): Promise<ActionResult<SsoProvider>> {
    return withStatus(async () => {
        const { token, orgId } = await getSessionContext({ write: "sso.write" });
        const result = await selfRequest<SsoProvider>(
            "/auth/sso/providers",
            { method: "POST", body: JSON.stringify(data) },
            token,
            orgId,
        );
        revalidatePath("/org/admin/sso");
        return result;
    });
}

export async function updateSsoProvider(
    id: string,
    data: SsoProviderUpdate,
): Promise<ActionResult<SsoProvider>> {
    return withStatus(async () => {
        const { token, orgId } = await getSessionContext({ write: "sso.write" });
        const result = await selfRequest<SsoProvider>(
            `/auth/sso/providers/${encodeURIComponent(id)}`,
            { method: "PATCH", body: JSON.stringify(data) },
            token,
            orgId,
        );
        revalidatePath("/org/admin/sso");
        return result;
    });
}

export async function deleteSsoProvider(id: string): Promise<ActionResult<void>> {
    return withStatus(async () => {
        const { token, orgId } = await getSessionContext({ write: "sso.write" });
        const result = await selfRequest<void>(
            `/auth/sso/providers/${encodeURIComponent(id)}`,
            { method: "DELETE" },
            token,
            orgId,
        );
        revalidatePath("/org/admin/sso");
        return result;
    });
}

export async function activateSsoProvider(id: string): Promise<ActionResult<SsoProvider>> {
    return withStatus(async () => {
        const { token, orgId } = await getSessionContext({ write: "sso.write" });
        const result = await selfRequest<SsoProvider>(
            `/auth/sso/providers/${encodeURIComponent(id)}/activate`,
            { method: "POST" },
            token,
            orgId,
        );
        revalidatePath("/org/admin/sso");
        return result;
    });
}

export async function deactivateSsoProvider(id: string): Promise<ActionResult<SsoProvider>> {
    return withStatus(async () => {
        const { token, orgId } = await getSessionContext({ write: "sso.write" });
        const result = await selfRequest<SsoProvider>(
            `/auth/sso/providers/${encodeURIComponent(id)}/deactivate`,
            { method: "POST" },
            token,
            orgId,
        );
        revalidatePath("/org/admin/sso");
        return result;
    });
}
