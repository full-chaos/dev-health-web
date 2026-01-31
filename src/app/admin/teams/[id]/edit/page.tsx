"use client";

import React from "react";
import { useRouter, useParams } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { TeamForm } from "@/components/admin/teams/TeamForm";
import { Team } from "@/components/admin/teams/TeamTable";

// Mock data - in a real app this would come from an API
const MOCK_TEAMS: Record<string, Team> = {
  "platform-eng": {
    team_id: "platform-eng",
    name: "Platform Engineering",
    description: "Responsible for internal developer platform and tooling.",
    repo_patterns: ["github/org/platform-*", "github/org/infra-*"],
    project_keys: ["PLAT", "INFRA"],
  },
  "product-a": {
    team_id: "product-a",
    name: "Product A Team",
    description: "Core product development team.",
    repo_patterns: ["github/org/product-a-*"],
    project_keys: ["PROJA"],
  },
  "data-science": {
    team_id: "data-science",
    name: "Data Science",
    description: "AI/ML and data analytics.",
    repo_patterns: ["github/org/ds-*", "github/org/ml-*"],
    project_keys: ["DATA"],
  },
};

export default function EditTeamPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const team = MOCK_TEAMS[id];

  const handleSubmit = (data: Team) => {
    console.log("Updating team:", data);
    // In a real app, this would be an API call
    // await updateTeam(id, data);
    router.push("/admin/teams");
  };

  if (!team) {
    return <div>Team not found</div>;
  }

  return (
    <div>
      <AdminHeader
        title="Edit Team"
        description={`Edit configuration for ${team.name}`}
      />
      <TeamForm initialData={team} onSubmit={handleSubmit} isEditing />
    </div>
  );
}
