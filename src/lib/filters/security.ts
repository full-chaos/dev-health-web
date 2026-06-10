/**
 * Encodes a UTF-8 string as base64url.
 *
 * Uses "base64" (not "base64url") when a Buffer is present because the
 * browser Buffer polyfill (injected by Next.js/webpack) does NOT support
 * the "base64url" encoding name and throws `TypeError: Unknown encoding`.
 * The URL-safe substitution is applied manually instead.
 *
 * Falls back to TextEncoder + btoa for environments where Buffer is absent.
 */
const toBase64Url = (value: string): string => {
    let base64: string;
    if (typeof Buffer !== "undefined") {
        // "base64" is supported by the browser polyfill; "base64url" is not.
        base64 = Buffer.from(value, "utf-8").toString("base64");
    } else {
        // TextEncoder guarantees correct UTF-8 byte handling (unlike raw btoa).
        const bytes = new TextEncoder().encode(value);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        base64 = btoa(binary);
    }
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

/**
 * Decodes a base64url string to a UTF-8 string.
 * Symmetric counterpart to toBase64Url — restores standard base64 padding
 * and characters before decoding so the round-trip is lossless.
 */
const fromBase64Url = (value: string): string => {
    // Restore standard base64: swap url-safe chars back and re-pad to 4-char boundary.
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    if (typeof Buffer !== "undefined") {
        // "base64" is supported by the browser polyfill; "base64url" is not.
        return Buffer.from(padded, "base64").toString("utf-8");
    }
    // TextDecoder guarantees correct UTF-8 decoding (unlike escape/decodeURIComponent).
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
};

const stableStringify = (input: unknown): string => {
    if (Array.isArray(input)) {
        return `[${input.map((item) => stableStringify(item)).join(",")}]`;
    }
    if (input && typeof input === "object") {
        const record = input as Record<string, unknown>;
        const keys = Object.keys(record).sort();
        return `{${keys
            .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(input);
};

// Allowed field keys for forward-compat filtering
const ALLOWED_KEYS = new Set([
    "severities",
    "sources",
    "states",
    "repoIds",
    "since",
    "until",
    "openOnly",
    "search",
]);

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "unknown";
export type SecuritySource =
    | "dependabot"
    | "code_scanning"
    | "advisory"
    | "gitlab_vulnerability"
    | "gitlab_dependency";
export type SecurityState = "open" | "fixed" | "dismissed" | "detected" | "confirmed" | "resolved";

export type SecurityFilter = {
    severities?: SecuritySeverity[];
    sources?: SecuritySource[];
    states?: SecurityState[];
    repoIds?: string[];
    since?: string; // ISO date
    until?: string; // ISO date
    openOnly?: boolean;
    search?: string;
};

export function defaultSecurityFilter(): SecurityFilter {
    return { openOnly: true };
}

export function encodeSecurityFilter(f: SecurityFilter): string {
    const serialized = stableStringify(f);
    return toBase64Url(serialized);
}

export function decodeSecurityFilter(encoded: string | undefined): SecurityFilter {
    if (!encoded) {
        return defaultSecurityFilter();
    }
    try {
        const decoded = fromBase64Url(encoded);
        const parsed = JSON.parse(decoded) as Record<string, unknown>;
        // Drop unknown keys for forward-compat
        const safe: Record<string, unknown> = {};
        for (const key of Object.keys(parsed)) {
            if (ALLOWED_KEYS.has(key)) {
                safe[key] = parsed[key];
            }
        }
        // If no known keys survived (e.g. a foreign MetricFilter payload carried
        // over by PrimaryNav), treat the param as absent and return the default
        // so openOnly:true is not silently lost.
        if (Object.keys(safe).length === 0) {
            return defaultSecurityFilter();
        }
        return safe as SecurityFilter;
    } catch {
        return defaultSecurityFilter();
    }
}

/**
 * Returns a new filter with `repoIds` locked to the given single repo.
 * Used by the evidence page to scope the queue without polluting URL state.
 */
export function applyLockedRepoId(filter: SecurityFilter, repoId: string): SecurityFilter {
    return { ...filter, repoIds: [repoId] };
}
