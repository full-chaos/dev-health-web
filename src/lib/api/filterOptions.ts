import { apiClient } from "@/lib/apiClient";
import { logger } from "@/lib/logger";

type FilterOptionsTeamNames = { team_names?: Record<string, string> | null };

/**
 * The served team id -> display name map of `/api/v1/filters/options`. A team the API holds no
 * name for is absent. Any failure gives an empty map: the caller then shows "Unresolved".
 */
export async function fetchTeamNames(): Promise<Record<string, string>> {
    try {
        const payload = await apiClient.getJson<FilterOptionsTeamNames>(
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
