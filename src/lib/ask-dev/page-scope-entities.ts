import type { FilterNames } from "@/lib/api/filterOptions";
import type { MetricFilter } from "@/lib/filters/types";

import { SUBJECT_ID } from "./page-context-ids";
import { PAGE_CONTEXT_ROUTES, type ApprovedRouteId, type PageEntityInput } from "./page-context";

/**
 * The team and the repository an overview page is scoped to, as Ask Dev page context
 * (CHAOS-11938, plan §2.4; lead ruling 2026-10-31 on "no filter state").
 *
 * The page's scope is the entity it shows, so it is proposed; the filter itself is not. Only:
 *
 * - **one team**: the scope is a team level with exactly one team id;
 * - **one repository**: the scope is a repository level with exactly one value, else the
 *   repository filter holds exactly one. The filter holds repository names (the options list is
 *   names), so a value becomes the repository id through the served id -> name map; a name two
 *   repositories share, or one the map does not hold, proposes nothing (never a guess).
 *
 * Several teams or repositories, a developer or a service scope, the time window, the role and
 * every other filter propose nothing. Only kinds the route takes are returned, so a page never
 * proposes what the registry would drop.
 */
export function scopePageEntities(input: {
    readonly routeId: ApprovedRouteId;
    readonly filters: MetricFilter;
    readonly names: Pick<FilterNames, "teams" | "repos">;
}): PageEntityInput[] {
    const { filters, names } = input;
    const kinds: readonly string[] = PAGE_CONTEXT_ROUTES[input.routeId].kinds;
    const entities: PageEntityInput[] = [];

    if (kinds.includes("team") && filters.scope.level === "team") {
        const [teamId, ...more] = filters.scope.ids;
        const id = more.length === 0 ? SUBJECT_ID.team(teamId) : null;
        if (id !== null && teamId !== undefined) {
            entities.push({ kind: "team", id, label: names.teams[teamId] ?? teamId.trim() });
        }
    }

    if (kinds.includes("repository")) {
        const values =
            filters.scope.level === "repo" ? filters.scope.ids : (filters.what.repos ?? []);
        const [value, ...more] = values;
        const repoId =
            more.length === 0 && value !== undefined ? repositoryId(value, names.repos) : null;
        const id = SUBJECT_ID.repository(repoId);
        if (id !== null && repoId !== null) {
            entities.push({ kind: "repository", id, label: names.repos[repoId] ?? repoId });
        }
    }
    return entities;
}

/** The repository id a filter value names: the id itself, or the one id whose name it is. */
function repositoryId(value: string, repoNames: Readonly<Record<string, string>>): string | null {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    if (Object.hasOwn(repoNames, trimmed)) return trimmed;
    const ids = Object.keys(repoNames).filter((id) => repoNames[id]?.trim() === trimmed);
    return ids.length === 1 ? (ids[0] ?? null) : null;
}
