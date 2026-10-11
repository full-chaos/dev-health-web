"use server";

import { adminApi } from "../api";
import type { ActionResult } from "@/lib/result";
import type { User, UserCreate, UserUpdate } from "../types";
import {
    SERVICE_ACCOUNT_EXISTS_MESSAGE,
    SERVICE_AUTH_PROVIDER,
    serviceAccountEmail,
    validateServiceAccountName,
} from "../serviceAccount";
import { getSessionContext, getToken, requireSuperuserToken, withErrorHandling } from "./_shared";

export async function listUsers(query?: string): Promise<ActionResult<User[]>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.users.list(token, orgId, query);
    });
}

export async function listPlatformUsers(query?: string): Promise<ActionResult<User[]>> {
    return withErrorHandling(async () => {
        const token = await getToken();
        return adminApi.users.list(token, undefined, query);
    });
}

export async function getUser(userId: string): Promise<ActionResult<User>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.users.get(userId, token, orgId);
    });
}

export async function createUser(data: UserCreate): Promise<ActionResult<User>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.users.create(data, token, orgId);
    });
}

export async function updateUser(userId: string, data: UserUpdate): Promise<ActionResult<User>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.users.update(userId, data, token, orgId);
    });
}

export async function deleteUser(userId: string): Promise<ActionResult<void>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.users.delete(userId, token, orgId);
    });
}

export async function setUserPassword(
    userId: string,
    password: string,
): Promise<ActionResult<void>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.users.setPassword(userId, password, token, orgId);
    });
}

/**
 * Platform-level create: no X-Org-Id, so the backend creates a platform user
 * with no org membership (an org-scoped superuser create would join the
 * superuser's own org).
 */
export async function createPlatformUser(data: UserCreate): Promise<ActionResult<User>> {
    return withErrorHandling(async () => {
        const token = await requireSuperuserToken();
        return adminApi.users.create(data, token, undefined);
    });
}

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
