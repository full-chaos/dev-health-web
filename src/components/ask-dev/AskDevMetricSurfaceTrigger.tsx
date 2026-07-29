import type { MetricFilter } from "@/lib/filters/types";
import {
    askDevContextForMetricSurface,
    type MetricAskDevRouteId,
} from "@/lib/dev/contextualFilters";
import type { AskDevSuggestedQuestionId } from "@/lib/dev/contextualEntryPoints";

import { AskDevTrigger } from "./AskDevTrigger";

export function AskDevMetricSurfaceTrigger({
    className,
    filters,
    routeId,
    suggestedQuestionIds,
}: {
    className?: string;
    filters: MetricFilter;
    routeId: MetricAskDevRouteId;
    suggestedQuestionIds?: readonly AskDevSuggestedQuestionId[];
}) {
    const context = askDevContextForMetricSurface({
        filters,
        routeId,
        suggestedQuestionIds,
    });
    return context ? <AskDevTrigger className={className} context={context} /> : null;
}
