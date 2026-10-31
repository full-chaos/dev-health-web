import { getBackendUrl } from "@/lib/origin";
import { fetchWithDeadline } from "@/lib/serverDeadline";

export class AdminApiError extends Error {
    constructor(
        public status: number,
        public statusText: string,
        public detail?: string,
        public method?: string,
        public code?: string,
        /** The purposes a served `detail.purposes` names (CHAOS-12173: unreadable BYO overrides); ids only. */
        public purposes?: string[],
    ) {
        super(detail || `${status} ${statusText}`);
        this.name = "AdminApiError";
    }
}

function errorCodeOf(raw: unknown): string | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const code = (raw as Record<string, unknown>).error;
    return typeof code === "string" ? code : undefined;
}

/** A served `detail.purposes`: a list of ids, kept only when every entry is a string. */
function purposesOf(raw: unknown): string[] | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const purposes = (raw as Record<string, unknown>).purposes;
    if (!Array.isArray(purposes) || !purposes.every((item) => typeof item === "string")) {
        return undefined;
    }
    return purposes as string[];
}

function formatErrorDetail(raw: unknown): string | undefined {
    if (typeof raw === "string") return raw;
    if (raw == null) return undefined;
    if (Array.isArray(raw)) {
        // FastAPI validation errors carry the submitted value under "input": show the field and the
        // message only, never the value (it can be a password).
        const lines = raw.map((item) => {
            if (item === null || typeof item !== "object") return "Invalid request";
            const entry = item as { loc?: unknown; msg?: unknown };
            const field = Array.isArray(entry.loc)
                ? entry.loc.filter((part) => part !== "body").join(".")
                : "";
            const msg = typeof entry.msg === "string" ? entry.msg : "Invalid value";
            return field ? `${field}: ${msg}` : msg;
        });
        return lines.join("; ");
    }
    if (typeof raw === "object") {
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
        // Covers both the legacy `{error, message}` shape above and other
        // admin-plane `{code, message}` detail objects — e.g. the
        // customer-push one-active-owner 409
        // (`{"code": "source_owned_by_fullchaos_sync", "message": "..."}`,
        // verified against api/admin/routers/customer_push.py). Any object
        // carrying a string `message` should surface that prose, not raw
        // JSON, regardless of whether it also has an `error` key.
        if (typeof obj.message === "string") return obj.message;
    }
    return "Request failed";
}

// CHAOS-9114: a GET is a read and gets the deadline; any other method is a write and never
// aborts (the server may have applied it), it is only logged when slow.
const isRead = (options: RequestInit): boolean => (options.method ?? "GET").toUpperCase() === "GET";

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

    const response = await fetchWithDeadline(
        url,
        { ...options, headers },
        { kind: isRead(options) ? "read" : "write" },
    );

    if (!response.ok) {
        let detail: string | undefined;
        let code: string | undefined;
        let purposes: string[] | undefined;
        try {
            const errorData = await response.json();
            detail = formatErrorDetail(errorData.detail || errorData.message);
            code = errorCodeOf(errorData.detail);
            purposes = purposesOf(errorData.detail);
        } catch {
            detail = undefined;
        }
        throw new AdminApiError(
            response.status,
            response.statusText,
            detail,
            options.method ?? "GET",
            code,
            purposes,
        );
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
    const isEntitlements = path.startsWith("/entitlements/") && isRead(options);

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

    const response = await fetchWithDeadline(
        url,
        { ...options, headers },
        isEntitlements
            ? { kind: "entitlements", op: "GET /api/v1/licensing/entitlements/:org" }
            : { kind: isRead(options) ? "read" : "write" },
    );

    if (!response.ok) {
        let detail: string | undefined;
        try {
            const errorData = await response.json();
            detail = formatErrorDetail(errorData.detail || errorData.message);
        } catch {
            detail = undefined;
        }
        throw new AdminApiError(
            response.status,
            response.statusText,
            detail,
            options.method ?? "GET",
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json();
}
