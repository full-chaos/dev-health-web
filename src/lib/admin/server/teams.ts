"use server";

import { adminApi } from "../api";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/result";
import type {
    TeamMapping,
    TeamMappingCreate,
    TeamMappingUpdate,
    DiscoveredTeam,
    TeamDiscoverResponse,
    TeamImportResponse,
    PendingChangesResponse,
} from "../types";
import { getSessionContext, withErrorHandling } from "./_shared";

export async function listTeams(): Promise<ActionResult<TeamMapping[]>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.teams.list(token, orgId);
    });
}

export async function createTeam(data: TeamMappingCreate): Promise<ActionResult<TeamMapping>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.teams.create(data, token, orgId);
    });
}

export async function getTeam(teamId: string): Promise<ActionResult<TeamMapping>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.teams.get(teamId, token, orgId);
    });
}

export async function updateTeam(
    teamId: string,
    data: TeamMappingUpdate,
): Promise<ActionResult<TeamMapping>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.teams.update(teamId, data, token, orgId);
    });
}

export async function deleteTeam(teamId: string): Promise<ActionResult<void>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.teams.delete(teamId, token, orgId);
    });
}

export async function discoverTeams(provider: string): Promise<ActionResult<TeamDiscoverResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.teams.discover(provider, token, orgId);
    });
}

export async function importTeams(
    teams: DiscoveredTeam[],
    onConflict: "skip" | "merge",
): Promise<ActionResult<TeamImportResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.teams.import({ teams, on_conflict: onConflict }, token, orgId);
    });
}

export async function getPendingTeamChanges(): Promise<ActionResult<PendingChangesResponse>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.teams.pendingChanges(token, orgId);
    });
}

export async function approveTeamChanges(
    teamId: string,
    changeIndices?: number[],
    approveAll = false,
): Promise<ActionResult<{ approved: number }>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.teams.approveChanges(
            teamId,
            changeIndices,
            approveAll,
            token,
            orgId,
        );
        revalidatePath("/admin/teams");
        return result;
    });
}

export async function dismissTeamChanges(
    teamId: string,
    changeIndices?: number[],
    dismissAll = false,
): Promise<ActionResult<{ dismissed: number }>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        const result = await adminApi.teams.dismissChanges(
            teamId,
            changeIndices,
            dismissAll,
            token,
            orgId,
        );
        revalidatePath("/admin/teams");
        return result;
    });
}

export async function triggerTeamDriftSync(): Promise<ActionResult<{ status: string }>> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        return adminApi.teams.triggerDriftSync(token, orgId);
    });
}
