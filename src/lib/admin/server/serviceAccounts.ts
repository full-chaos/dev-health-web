"use server";

import { adminApi } from "../api";
import type { ActionResult } from "@/lib/result";
import type { User } from "../types";
import { requireSuperuserToken, withErrorHandling } from "./_shared";
import {
    SERVICE_ACCOUNT_EXISTS_MESSAGE,
    SERVICE_AUTH_PROVIDER,
    serviceAccountEmail,
    validateServiceAccountName,
} from "../serviceAccount";

/**
 * Platform-admin create of a service account: a platform user (no org, no password) marked with
 * the service auth provider. The name is checked here as well, not only in the form. A duplicate
 * gets one plain sentence, not the served text.
 */
export async function createServiceAccount(input: {
    name: string;
    description?: string;
}): Promise<ActionResult<User>> {
    const problem = validateServiceAccountName(input.name);
    if (problem) return { error: problem };
    const result = await withErrorHandling(async () => {
        const token = await requireSuperuserToken();
        const description = input.description?.trim();
        return adminApi.users.create(
            {
                email: serviceAccountEmail(input.name),
                auth_provider: SERVICE_AUTH_PROVIDER,
                ...(description ? { full_name: description } : {}),
            },
            token,
            undefined,
        );
    });
    if (result.error && /already exists/iu.test(result.error)) {
        return { error: SERVICE_ACCOUNT_EXISTS_MESSAGE };
    }
    return result;
}
