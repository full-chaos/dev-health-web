"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TeamForm } from "@/components/admin/teams/TeamForm";
import { Team } from "@/components/admin/teams/TeamTable";
import { updateTeam } from "@/lib/admin/server";
import type { TeamMapping } from "@/lib/admin/types";

type EditTeamFormWrapperProps = {
  team: TeamMapping;
};

export function EditTeamFormWrapper({ team }: EditTeamFormWrapperProps) {
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

      const result = await updateTeam(team.team_id, {
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
     <TeamForm initialData={initialData} onSubmit={handleSubmit} isEditing isLoading={isLoading} />
   );
 }
