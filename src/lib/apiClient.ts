import { resolveOrigin } from "@/lib/origin";
import { isServer } from "@/lib/env";
import { ApiErrors, apiErrorMessage } from "@/lib/constants/errors";

/**
 * Generate a unique request ID for distributed tracing.
 *
 * Uses crypto.randomUUID() when available (all modern runtimes) and falls
 * back to a timestamp+random string for environments that don't support it.
 */
function generateRequestId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ApiQueryParams = Record<string, string | number | boolean | null | undefined>;

export type ApiFetchInit = RequestInit & {
    next?: {
        revalidate?: number;
    };
};

const buildUrl = (path: string, params?: ApiQueryParams) => {
    const url = new URL(path, resolveOrigin());
    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value === "" || value === undefined || value === null) {
                return;
            }
            url.searchParams.set(key, String(value));
        });
    }
    return url.toString();
};

async function getServerAuthHeaders(): Promise<Record<string, string>> {
    if (!isServer) return {};
    try {
        const { auth } = await import("@/lib/auth");
        const session = await auth();
        if (session?.access_token) {
            return { Authorization: `Bearer ${session.access_token}` };
        }
    } catch {}
    return {};
}

const inflightRequests = new Map<string, Promise<Response>>();

const request = async (
    path: string,
    init?: ApiFetchInit,
    params?: ApiQueryParams,
): Promise<Response> => {
    const url = buildUrl(path, params);
    const cacheKey = `${init?.method ?? "GET"}:${url}`;

    const existing = inflightRequests.get(cacheKey);
    if (existing) {
        return existing.then((r) => r.clone());
    }

    const authHeaders = await getServerAuthHeaders();

    // Attach X-Request-ID for distributed tracing across the web → backend boundary.
    // Callers may supply their own via init.headers; we only generate if absent.
    const existingHeaders = (init?.headers ?? {}) as Record<string, string>;
    const requestId =
        existingHeaders["X-Request-ID"] ?? existingHeaders["x-request-id"] ?? generateRequestId();

    const mergedInit: ApiFetchInit = {
        ...init,
        headers: {
            ...authHeaders,
            ...existingHeaders,
            "X-Request-ID": requestId,
        },
    };

    const promise = fetch(url, mergedInit);
    inflightRequests.set(cacheKey, promise);

    try {
        const response = await promise;
        return response.clone();
    } finally {
        inflightRequests.delete(cacheKey);
    }
};

const fetchJson = async <T>(
    path: string,
    init?: ApiFetchInit,
    params?: ApiQueryParams,
): Promise<T> => {
    const response = await request(path, init, params);
    if (!response.ok) {
        if (response.status === 429) {
            throw new Error(ApiErrors.RateLimitExceeded);
        }
        throw new Error(apiErrorMessage(response.status));
    }
    // Use text() and trim() to handle keep-alive pings (leading/trailing whitespace)
    const text = await response.text();
    return JSON.parse(text.trim()) as T;
};

const getJson = async <T>(path: string, params?: ApiQueryParams, init?: ApiFetchInit): Promise<T> =>
    fetchJson<T>(path, init, params);

const postJson = async <T>(
    path: string,
    body: unknown,
    init?: ApiFetchInit,
    params?: ApiQueryParams,
): Promise<T> => {
    const headers = {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
    };
    return fetchJson<T>(
        path,
        {
            ...init,
            method: "POST",
            headers,
            body: JSON.stringify(body),
        },
        params,
    );
};

const sendBeacon = (path: string, body: string | Blob, contentType = "application/json") => {
    if (typeof navigator === "undefined" || !navigator.sendBeacon) {
        return false;
    }
    const payload = body instanceof Blob ? body : new Blob([body], { type: contentType });
    return navigator.sendBeacon(buildUrl(path), payload);
};

/**
 * Fetch with fallback candidates.
 *
 * Tries each candidate in order, stopping on success or non-recoverable error.
 * Recoverable errors (400, 404, 422) trigger fallback to next candidate.
 *
 * @param path - API endpoint path
 * @param init - Fetch init options
 * @param buildParams - Function that takes a candidate and returns query params
 * @param candidates - Array of candidate values to try
 * @returns Parsed JSON response
 * @throws Error if all candidates fail
 */
const fetchWithFallback = async <T, C>(
    path: string,
    init: ApiFetchInit,
    buildParams: (candidate: C) => ApiQueryParams,
    candidates: C[],
): Promise<T> => {
    let lastError: unknown;

    for (const candidate of candidates) {
        const params = buildParams(candidate);
        const response = await request(path, init, params);

        if (response.ok) {
            const text = await response.text();
            return JSON.parse(text.trim()) as T;
        }

        lastError = response;

        // Stop if single candidate or non-recoverable error
        if (candidates.length === 1) {
            break;
        }
        // Only continue to fallback on 400/404/422 (client errors that might resolve with different scope)
        if (response.status !== 400 && response.status !== 404 && response.status !== 422) {
            break;
        }
    }

    if (lastError instanceof Response) {
        if (lastError.status === 429) {
            throw new Error(ApiErrors.RateLimitExceeded);
        }
        throw new Error(apiErrorMessage(lastError.status));
    }
    throw lastError ?? new Error(ApiErrors.GenericApiError);
};

export const apiClient = {
    buildUrl,
    request,
    fetchJson,
    getJson,
    postJson,
    sendBeacon,
    fetchWithFallback,
};
