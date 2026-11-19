"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TeamForm } from "@/components/admin/teams/TeamForm";
import { Team } from "@/components/admin/teams/TeamTable";
import { updateTeam } from "@/lib/admin/server";
import { isTeamConflict, TEAM_CHANGED_MESSAGE } from "@/lib/admin/teamConflict";
import type { TeamMapping, TeamMappingUpdate } from "@/lib/admin/types";

type EditTeamFormWrapperProps = {
    team: TeamMapping;
    linkedIdentityCount?: number;
};

const sameList = (a: string[], b: string[]) =>
    a.length === b.length && a.every((item, index) => item === b[index]);

/** The PATCH body: only the fields the user changed against the loaded team. */
export function changedTeamFields(team: TeamMapping, data: Team): TeamMappingUpdate {
    const update: TeamMappingUpdate = {};
    if (data.name !== team.name) update.name = data.name;
    // go-api reads an absent or null description as "keep"; only "" clears it.
    if ((data.description ?? "") !== (team.description ?? "")) {
        update.description = data.description ?? "";
    }
    if (!sameList(data.repo_patterns, team.repo_patterns)) {
        update.repo_patterns = data.repo_patterns;
    }
    if (!sameList(data.project_keys, team.project_keys)) {
        update.project_keys = data.project_keys;
    }
    return update;
}

export function EditTeamFormWrapper({ team, linkedIdentityCount }: EditTeamFormWrapperProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const initialData: Team = {
        team_id: team.team_id,
        name: team.name,
        description: team.description,
        repo_patterns: team.repo_patterns,
        project_keys: team.project_keys,
    };

    const handleSubmit = async (data: Team) => {
        setIsLoading(true);

        const changes = changedTeamFields(team, data);
        if (Object.keys(changes).length === 0) {
            setIsLoading(false);
            router.push("/org/admin/teams");
            return;
        }

        const result = await updateTeam(team.team_id, changes);

        setIsLoading(false);

        if (result.error) {
            if (isTeamConflict(result)) {
                toast.error(TEAM_CHANGED_MESSAGE);
                router.refresh();
                return;
            }
            toast.error(result.error);
            return;
        }

        router.push("/org/admin/teams");
    };

    return (
        <TeamForm
            key={team.updated_at}
            initialData={initialData}
            onSubmit={handleSubmit}
            isEditing
            isLoading={isLoading}
            linkedIdentityCount={linkedIdentityCount}
        />
    );
}
