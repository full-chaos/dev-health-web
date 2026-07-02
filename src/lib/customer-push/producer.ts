/**
 * Client-side producer-type bucketing for the batch status list/filters
 * (CHAOS-2714 design decision D8). The batch envelope only carries a
 * free-text `source.producer` string — there is no backend `producer_type`
 * enum — so this is a pure prefix/substring heuristic used only for filter
 * chips and badge coloring. Never send the derived value back to the API.
 *
 * The design brief's original heuristic included a "console" bucket for
 * producer === "web-console" (in-product push). That leg is CUT: the
 * console-push proxy was overruled post-critique (Screen 5 is validate-only
 * in v1), so "web-console" now falls through to the "api" bucket like any
 * other unrecognized producer string.
 */

import type { CustomerPushBatchStatus } from "@/lib/admin/types";

export type ProducerBucket = "cli" | "ci" | "relay" | "api";

export function classifyProducer(producer: string): ProducerBucket {
    const value = producer.toLowerCase();
    if (value.startsWith("dev-hops")) return "cli";
    if (value.includes("github-actions") || value.includes("gitlab-ci") || value.includes(".ci."))
        return "ci";
    if (value.includes("relay")) return "relay";
    return "api";
}

export const PRODUCER_BUCKET_LABELS: Record<ProducerBucket, string> = {
    cli: "CLI",
    ci: "CI",
    relay: "Relay",
    api: "API",
};

/** Terminal batch statuses — polling/refresh stops once one of these is reached (CC12). */
export function isTerminalCustomerPushStatus(status: CustomerPushBatchStatus): boolean {
    return status === "completed" || status === "partial" || status === "failed";
}
