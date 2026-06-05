"use server";

import { adminApi } from "../api";
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
