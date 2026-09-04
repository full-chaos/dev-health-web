import { encodeFilter } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

import {
    fingerprintAskDevFilter,
    isApprovedAskDevSurfaceContext,
    type ApprovedAskDevRouteId,
    type AskDevSuggestedQuestionId,
    type AskDevSurfaceContext,
} from "./contextualEntryPoints";

export type MetricAskDevRouteId = Extract<
    ApprovedAskDevRouteId,
    | "diagnose_overview"
    | "flow_metrics"
    | "investment"
    | "complexity"
    | "cognitive_load"
    | "bottlenecks"
>;

export function repositoryIdsFromMetricFilter(filters: MetricFilter): readonly string[] {
    const candidates =
        filters.scope.level === "repo" ? filters.scope.ids : (filters.what.repos ?? []);
    return [...new Set(candidates)].slice(0, 20);
}

/**
 * Builds a safe metric-surface proposal from canonical filter IDs. Repository
 * labels are controlled placeholders; Ops re-resolves every ID and supplies
 * canonical names rather than trusting browser text.
 */
export function askDevContextForMetricSurface({
    filters,
    routeId,
    suggestedQuestionIds,
}: {
    filters: MetricFilter;
    routeId: MetricAskDevRouteId;
    suggestedQuestionIds?: readonly AskDevSuggestedQuestionId[];
}): AskDevSurfaceContext | null {
    const repositoryIds = repositoryIdsFromMetricFilter(filters);
    const context: AskDevSurfaceContext = {
        routeId,
        entityRefs: repositoryIds.map((entityId, index) => ({
            entity_type: "repository",
            entity_id: entityId,
            display_label:
                repositoryIds.length === 1
                    ? "Selected repository"
                    : `Selected repository ${index + 1}`,
        })),
        filterFingerprint: fingerprintAskDevFilter(encodeFilter(filters)),
        ...(suggestedQuestionIds ? { suggestedQuestionIds } : {}),
    };
    return isApprovedAskDevSurfaceContext(context) ? context : null;
}
