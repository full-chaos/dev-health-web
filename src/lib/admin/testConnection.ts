import type { Result } from "@/lib/result";
import type { TestConnectionResponse } from "./types";

/**
 * The reason a connection test failed, in the order the backend fills them.
 *
 * A provider probe reports why it refused in `details.error` and leaves the
 * top-level `error` null; only the endpoint's own exception path sets
 * `error`. Reading one without the other renders every provider's refusal as
 * the same blank "Connection test failed" (CHAOS-4223).
 */
export function testConnectionFailureMessage(result: Result<TestConnectionResponse>): string {
    const candidates = [result.error, result.data?.error, result.data?.details?.error];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
            return candidate;
        }
    }
    return "Connection test failed";
}
