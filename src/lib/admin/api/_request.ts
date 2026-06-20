import { getBackendUrl } from "@/lib/origin";

export class AdminApiError extends Error {
    constructor(
        public status: number,
        public statusText: string,
        public detail?: string,
    ) {
        super(detail || `${status} ${statusText}`);
        this.name = "AdminApiError";
    }
}

function formatErrorDetail(raw: unknown): string | undefined {
    if (typeof raw === "string") return raw;
    if (raw == null) return undefined;
    if (typeof raw === "object" && "error" in raw) {
        const obj = raw as Record<string, unknown>;
        if (obj.error === "feature_not_licensed") {
            const tier = typeof obj.required_tier === "string" ? obj.required_tier : "a higher";
            const currentTier =
                typeof obj.current_tier === "string" ? obj.current_tier : "community";
            return `This feature requires the ${tier} plan (current plan: ${currentTier}).`;
        }
        if (obj.error === "limit_exceeded") {
            const limit = typeof obj.limit === "string" ? obj.limit : "resource";
            return `Plan limit reached: ${limit} (${obj.current}/${obj.maximum}).`;
        }
        if (typeof obj.message === "string") return obj.message;
    }
    return JSON.stringify(raw);
}

export async function request<T>(
    path: string,
    options: RequestInit = {},
    accessToken?: string,
    orgId?: string,
): Promise<T> {
    const baseUrl = getBackendUrl();
    const url = `${baseUrl}/api/v1/admin${path}`;

    const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...options.headers,
    };

    if (accessToken) {
        (headers as Record<string, string>)["Authorization"] = `Bearer ${accessToken}`;
    }

    if (orgId) {
        (headers as Record<string, string>)["X-Org-Id"] = orgId;
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (!response.ok) {
        let detail: string | undefined;
        try {
            const errorData = await response.json();
            detail = formatErrorDetail(errorData.detail || errorData.message);
        } catch {
            detail = undefined;
        }
        throw new AdminApiError(response.status, response.statusText, detail);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json();
}

export async function licensingRequest<T>(
    path: string,
    options: RequestInit = {},
    accessToken?: string,
    orgId?: string,
): Promise<T> {
    const baseUrl = getBackendUrl();
    const url = `${baseUrl}/api/v1/licensing${path}`;

    const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...options.headers,
    };

    if (accessToken) {
        (headers as Record<string, string>)["Authorization"] = `Bearer ${accessToken}`;
    }

    if (orgId) {
        (headers as Record<string, string>)["X-Org-Id"] = orgId;
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (!response.ok) {
        let detail: string | undefined;
        try {
            const errorData = await response.json();
            detail = formatErrorDetail(errorData.detail || errorData.message);
        } catch {
            detail = undefined;
        }
        throw new AdminApiError(response.status, response.statusText, detail);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json();
}
