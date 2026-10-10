import { METRIC_CATALOG, getMetricLabel } from "@/lib/metrics/catalog";
import { apiErrorMessage } from "@/lib/constants/errors";
import type { ExplainResponse } from "@/lib/types";

const REFUSED_STATUSES = [400, 404, 422];

/**
 * Whether an explain answer is for ANOTHER metric than the one asked for (CHAOS-9137).
 *
 * The explain route echoes the REQUESTED metric string in `metric` even when it does not know
 * it and answers with another metric's config (the cycle_time fallback), so `metric` cannot
 * tell. The label can: the answer then carries the other metric's label. So the answer is for
 * another metric when its `metric` names a different one, or when its label is not the
 * requested metric's catalog label but IS the catalog label of a different catalog metric.
 * A served label that is no catalog label at all is kept (a producer may name a metric its own way).
 */
export function explainAnswerIsForOtherMetric(
    requested: string,
    answer: Pick<ExplainResponse, "metric" | "label">,
): boolean {
    if (answer.metric && answer.metric !== requested) return true;
    if (!answer.label || answer.label === getMetricLabel(requested)) return false;
    return METRIC_CATALOG.some(
        (entry) => entry.metric !== requested && entry.label === answer.label,
    );
}

/** A client error the explain route answers for a metric it does not know: no explain data. */
export function isExplainClientError(err: unknown): boolean {
    // The API client throws no status: it throws `apiErrorMessage(status)`, so compare with that.
    return err instanceof Error && REFUSED_STATUSES.some((s) => err.message === apiErrorMessage(s));
}
