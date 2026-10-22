"use server";

import { adminApi, AdminApiError } from "../api";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/result";
import type {
    OrgEntitlements,
    FeatureFlag,
    FeatureOverride,
    FeatureOverrideCreate,
} from "../types";
import { getSessionContext, requireSuperuserToken, withErrorHandling } from "./_shared";

export async function getOrgEntitlements(orgId: string): Promise<ActionResult<OrgEntitlements>> {
    return withErrorHandling(async () => {
        const { token, orgId: sessionOrgId } = await getSessionContext();
        if (sessionOrgId === orgId) {
            return adminApi.licensing.entitlements(orgId, token, sessionOrgId);
        }

        const superuserToken = await requireSuperuserToken();
        return adminApi.licensing.entitlements(orgId, superuserToken);
    });
}

export async function listFeatureFlags(): Promise<ActionResult<FeatureFlag[]>> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken();
        return adminApi.licensing.featureFlags(token);
    });
}

export async function listFeatureOverrides(
    orgId: string,
): Promise<ActionResult<FeatureOverride[]>> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken();
        return adminApi.licensing.overrides.list(orgId, token);
    });
}

export async function createFeatureOverride(
    orgId: string,
    data: FeatureOverrideCreate,
): Promise<ActionResult<FeatureOverride>> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken();
        const result = await adminApi.licensing.overrides.create(orgId, data, token);
        revalidatePath(`/superadmin/licensing/${orgId}`);
        return result;
    });
}

export async function deleteFeatureOverride(
    orgId: string,
    overrideId: string,
): Promise<ActionResult<void>> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken();
        const result = await adminApi.licensing.overrides.delete(orgId, overrideId, token);
        revalidatePath(`/superadmin/licensing/${orgId}`);
        return result;
    });
}

const PLATFORM_MODEL_FALLBACK_KEY = "platform_model_fallback";

export type PlatformModelFallbackChange = { changed: boolean; notice: string };

export async function grantPlatformModelFallback(
    orgId: string,
): Promise<ActionResult<PlatformModelFallbackChange>> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken();
        const overrides = await adminApi.licensing.overrides.list(orgId, token);
        const existing = overrides.find((o) => o.feature_key === PLATFORM_MODEL_FALLBACK_KEY);
        const active =
            existing?.is_enabled &&
            (!existing.expires_at || new Date(existing.expires_at) > new Date());
        if (existing && active) {
            revalidatePath(`/superadmin/licensing/${orgId}`);
            return {
                changed: false,
                notice: "A platform admin grant already exists for this org.",
            };
        }
        const flags = await adminApi.licensing.featureFlags(token);
        const flag = flags.find((f) => f.key === PLATFORM_MODEL_FALLBACK_KEY);
        if (!flag) {
            throw new AdminApiError(
                404,
                "Not Found",
                "Platform model fallback is not in the feature catalog",
            );
        }
        if (existing) {
            await adminApi.licensing.overrides.delete(orgId, existing.id, token);
        }
        await adminApi.licensing.overrides.create(
            orgId,
            { feature_id: flag.id, is_enabled: true, reason: "Platform admin grant" },
            token,
        );
        revalidatePath(`/superadmin/licensing/${orgId}`);
        return { changed: true, notice: "Platform admin grant saved." };
    });
}

export async function revokePlatformModelFallback(
    orgId: string,
): Promise<ActionResult<PlatformModelFallbackChange>> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken();
        const overrides = await adminApi.licensing.overrides.list(orgId, token);
        const existing = overrides.find((o) => o.feature_key === PLATFORM_MODEL_FALLBACK_KEY);
        if (!existing) {
            revalidatePath(`/superadmin/licensing/${orgId}`);
            return { changed: false, notice: "No platform admin grant exists for this org." };
        }
        await adminApi.licensing.overrides.delete(orgId, existing.id, token);
        revalidatePath(`/superadmin/licensing/${orgId}`);
        return { changed: true, notice: "Platform admin grant removed." };
    });
}
