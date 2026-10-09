/** Team ids of teams created by hand in the admin start with this prefix; synced teams never do. */
const CUSTOM_TEAM_ID_PREFIX = "custom:";

/** True for a manually created team. Only these teams may be deleted from the admin teams list. */
export function isCustomTeam(teamId: string | null | undefined): boolean {
    return typeof teamId === "string" && teamId.startsWith(CUSTOM_TEAM_ID_PREFIX);
}
