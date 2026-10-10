import { apiClient } from "@/lib/apiClient";
import { logger } from "@/lib/logger";

type FilterOptionsNames = {
    team_names?: Record<string, string> | null;
    repo_names?: Record<string, string> | null;
    developer_names?: Record<string, string> | null;
};

export type FilterNames = {
    teams: Record<string, string>;
    repos: Record<string, string>;
    developers: Record<string, string>;
};

/**
 * The served team id -> display name map of `/api/v1/filters/options`. A team the API holds no
 * name for is absent. Any failure gives an empty map: the caller then shows "Unresolved".
 */
export async function fetchTeamNames(): Promise<Record<string, string>> {
    try {
        const payload = await apiClient.getJson<FilterOptionsNames>(
            "/api/v1/filters/options",
            undefined,
            { next: { revalidate: 60 } },
        );
        return payload.team_names ?? {};
    } catch (err) {
        logger.warn({ err }, "fetchTeamNames: failed to load team names");
        return {};
    }
}

/**
 * The served id -> display name maps of `/api/v1/filters/options` (teams, repositories,
 * developers): the same source the scope bar reads. Any failure gives empty maps.
 */
export async function fetchFilterNames(): Promise<FilterNames> {
    try {
        const payload = await apiClient.getJson<FilterOptionsNames>(
            "/api/v1/filters/options",
            undefined,
            { next: { revalidate: 60 } },
        );
        return {
            teams: payload.team_names ?? {},
            repos: payload.repo_names ?? {},
            developers: payload.developer_names ?? {},
        };
    } catch (err) {
        logger.warn({ err }, "fetchFilterNames: failed to load names");
        return { teams: {}, repos: {}, developers: {} };
    }
}
