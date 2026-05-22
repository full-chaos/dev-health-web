import { isBrowser } from "@/lib/env";
import { getServerEnv } from "@/lib/config";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

/**
 * Resolve the origin URL for API requests.
 *
 * @returns The base URL to use for API requests
 */
export function resolveOrigin(): string {
  if (isBrowser) {
    return window.location.origin;
  }
  return getServerEnv().BACKEND_URL ?? DEFAULT_BACKEND_URL;
}

/**
 * Get the backend URL for direct server-side access.
 * Used by proxy.ts and other server-only code.
 *
 * @returns The backend URL from environment or default
 */
export function getBackendUrl(): string {
  return getServerEnv().BACKEND_URL ?? DEFAULT_BACKEND_URL;
}
