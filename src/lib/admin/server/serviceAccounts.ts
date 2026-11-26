"use server";

import { adminApi } from "../api";
import type { ActionResult } from "@/lib/result";
import type { ServiceAccount } from "../types";
import { requireSuperuserToken, withErrorHandling } from "./_shared";
import { ACTION_FAILED_MESSAGE } from "@/lib/actionFailure";
import { SERVICE_ACCOUNT_EXISTS_MESSAGE, validateServiceAccountName } from "../serviceAccount";

/**
 * Platform-admin create of a service account in an organization, owned by a member of it, through
 * the dedicated ops route. The name is checked here as well, not only in the form. A duplicate
 * gets one plain sentence, not the served text.
 */
export async function createServiceAccount(input: {
    name: string;
    organization_id: string;
    owner_principal_id: string;
}): Promise<ActionResult<ServiceAccount>> {
    const problem = validateServiceAccountName(input.name);
    if (problem) return { error: problem };
    const result = await withErrorHandling(async () => {
        const token = await requireSuperuserToken({
            action: "admin.users",
            guard: "platform.users",
        });
        return adminApi.users.createServiceAccount(
            {
                organization_id: input.organization_id,
                owner_principal_id: input.owner_principal_id,
                name: input.name.trim(),
            },
            token,
            undefined,
        );
    });
    if (result.error && /already exists|name is taken/iu.test(result.error)) {
        return { error: SERVICE_ACCOUNT_EXISTS_MESSAGE };
    }
    if (result.error && result.status === 404) return { error: ACTION_FAILED_MESSAGE };
    return result;
}
