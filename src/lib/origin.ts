import { isBrowser } from "@/lib/env";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

/**
 * Resolve the origin URL for API requests.
 *
 * @returns The base URL to use for API requests
 */
export function resolveOrigin(): string {
    if (isBrowser) {
        // Browser: use relative paths, Next.js rewrites proxy to backend
        return window.location.origin;
    }
    // Server-side SSR: must use absolute URL to reach backend directly
    // process.env is read at runtime, not baked in at build time
    return process.env.BACKEND_URL ?? DEFAULT_BACKEND_URL;
}

/**
 * Get the backend URL for direct server-side access.
 * Used by proxy.ts and other server-only code.
 *
 * @returns The backend URL from environment or default
 */
export function getBackendUrl(): string {
    return process.env.BACKEND_URL ?? DEFAULT_BACKEND_URL;
}
