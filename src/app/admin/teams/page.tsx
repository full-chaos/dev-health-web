import React from "react";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { TeamTable, Team } from "@/components/admin/teams/TeamTable";

// Mock data
const MOCK_TEAMS: Team[] = [
  {
    team_id: "platform-eng",
    name: "Platform Engineering",
    description: "Responsible for internal developer platform and tooling.",
    repo_patterns: ["github/org/platform-*", "github/org/infra-*"],
    project_keys: ["PLAT", "INFRA"],
  },
  {
    team_id: "product-a",
    name: "Product A Team",
    description: "Core product development team.",
    repo_patterns: ["github/org/product-a-*"],
    project_keys: ["PROJA"],
  },
  {
    team_id: "data-science",
    name: "Data Science",
    description: "AI/ML and data analytics.",
    repo_patterns: ["github/org/ds-*", "github/org/ml-*"],
    project_keys: ["DATA"],
  },
];

export default function TeamsPage() {
  return (
    <div>
      <AdminHeader
        title="Teams"
        description="Manage teams and their resource ownership mappings."
      >
        <Link
          href="/admin/teams/new"
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
        >
          Add Team
        </Link>
      </AdminHeader>

      <div className="mb-6 flex gap-4">
        <input
          type="text"
          placeholder="Search teams..."
          className="w-full max-w-sm rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
        />
      </div>

      <TeamTable teams={MOCK_TEAMS} />
    </div>
  );
}
