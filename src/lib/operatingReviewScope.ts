import type { MetricFilter } from "@/lib/filters/types";

export function selectedOperatingReviewTeamIds(
    teamParam: string | string[] | undefined,
    filters: MetricFilter,
): string[] {
    const explicitTeamIds = uniqueNonEmptyValues(teamParam);
    if (explicitTeamIds.length) {
        return explicitTeamIds;
    }

    return filters.scope.level === "team" ? uniqueNonEmptyValues(filters.scope.ids) : [];
}

function uniqueNonEmptyValues(value: string | string[] | undefined): string[] {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}
