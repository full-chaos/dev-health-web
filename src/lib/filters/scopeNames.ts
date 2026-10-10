import { teamMenuLabels, teamScopeLabels } from "@/components/filters/filterBarUtils";
import type { FilterNames } from "@/lib/api/filterOptions";
import { containsIdToken } from "@/lib/labels/idToken";
import type { MetricFilter } from "./types";

/**
 * The names of the selected scope ids, by the rule of the scope bar: the served name, else
 * "Unresolved" (teams: one "Unresolved" for all), never the id.
 */
export function scopeNames(
    level: MetricFilter["scope"]["level"],
    ids: string[],
    names: FilterNames,
): string[] {
    if (level === "team") {
        return teamScopeLabels(Object.keys(names.teams), names.teams, ids).selected;
    }
    if (level === "repo") return repoNames(ids, names);
    if (level === "developer") return developerNames(ids, names);
    return teamMenuLabels([], {}, ids).selected;
}

export function repoNames(ids: string[], names: FilterNames): string[] {
    return teamMenuLabels(Object.keys(names.repos), names.repos, ids, (v) => !containsIdToken(v))
        .selected;
}

export function developerNames(ids: string[], names: FilterNames): string[] {
    return teamMenuLabels(Object.keys(names.developers), names.developers, ids).selected;
}
