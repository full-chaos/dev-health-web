// Shared internal helpers for billing actions — NOT a server action file.
// Do not re-export from the barrel; these are implementation details.
import { failureFromError } from "@/lib/actionFailure";
import { AdminApiError } from "@/lib/admin/api";
import { auth } from "@/lib/auth";
import { getServerEnv } from "@/lib/config";
import { AuthErrors, ValidationErrors, requestFailedMessage } from "@/lib/constants/errors";
import type { ActionResult } from "@/lib/result";
import { deadlineFetch } from "@/lib/serverDeadline";

// Validates that an ID only contains safe characters (alphanumeric, hyphens, underscores)
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
export function sanitizeId(id: string): string {
    if (!SAFE_ID_RE.test(id)) {
        throw new Error(ValidationErrors.InvalidIdFormat);
    }
    return id;
}

export async function getAuthHeaders(): Promise<ActionResult<HeadersInit>> {
    const session = await auth();
    if (!session?.access_token) {
        return { error: "Unauthorized" };
    }

    return {
        data: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
        },
    };
}

export async function resolveOrgId(orgId?: string): Promise<ActionResult<string | undefined>> {
    const session = await auth();
    if (!session?.access_token) {
        return { error: "Unauthorized" };
    }

    const sessionOrgId = session.user?.org_id;
    const isSuperuser = session.user?.is_superuser ?? false;

    if (!orgId) {
        return { data: sessionOrgId };
    }

    if (isSuperuser) {
        return { data: orgId };
    }

    if (orgId !== sessionOrgId) {
        return { error: "Access denied: cannot access resources for another organization" };
    }

    return { data: orgId };
}

export function getBackendUrl(): string {
    return getServerEnv().BACKEND_URL ?? "http://127.0.0.1:8000";
}

export async function getAuthHeadersOrThrow(): Promise<Record<string, string>> {
    const session = await auth();
    if (!session?.access_token) {
        throw new Error(AuthErrors.Unauthorized);
    }
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
    };
}

export async function withErrorHandling<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
    try {
        return { data: await fn() };
    } catch (err) {
        return failureFromError("billingRequest", err);
    }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = await getAuthHeadersOrThrow();
    const response = await deadlineFetch(
        (init?.method ?? "GET").toUpperCase() === "GET" ? "read" : "write",
    )(`${getBackendUrl()}${path}`, {
        ...init,
        headers: {
            ...headers,
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    });

    if (!response.ok) {
        const detail = await response.json().catch(() => ({ detail: response.statusText }));
        throw new AdminApiError(
            response.status,
            requestFailedMessage(response.status),
            typeof detail.detail === "string" ? detail.detail : undefined,
            init?.method ?? "GET",
        );
    }

    return (await response.json()) as T;
}
