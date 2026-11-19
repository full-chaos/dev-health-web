import type { Result } from "@/lib/result";

/** The closed code go-api serves when an admin team write loses a race (409). */
export const TEAM_CHANGED_CONCURRENTLY = "team_changed_concurrently";

/** The authored sentence for that 409: the served text is never shown. */
export const TEAM_CHANGED_MESSAGE =
    "Someone else changed this team. The page shows the newest version; check it and save again.";

export function isTeamConflict(result: Pick<Result<unknown>, "status" | "code">): boolean {
    return result.status === 409 && result.code === TEAM_CHANGED_CONCURRENTLY;
}
