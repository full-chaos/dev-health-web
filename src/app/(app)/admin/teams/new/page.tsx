"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { TeamForm } from "@/components/admin/teams/TeamForm";
import { Team } from "@/components/admin/teams/TeamTable";
import { createTeam } from "@/lib/admin/server";

export default function NewTeamPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (data: Team) => {
        setIsLoading(true);

        const result = await createTeam({
            team_id: data.team_id,
            name: data.name,
            description: data.description || undefined,
            repo_patterns: data.repo_patterns,
            project_keys: data.project_keys,
        });

        setIsLoading(false);

        if (result.error) {
            toast.error(result.error);
            return;
        }

        router.push("/admin/teams");
    };

    return (
        <div>
            <AdminHeader
                title="Add Team"
                description="Create a new team and define its resource ownership."
            />
            <TeamForm onSubmit={handleSubmit} isLoading={isLoading} />
        </div>
    );
}
