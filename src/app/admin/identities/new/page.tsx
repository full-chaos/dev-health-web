"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { IdentityForm } from "@/components/admin/identities/IdentityForm";
import { Identity } from "@/components/admin/identities/IdentityTable";
import { Team } from "@/components/admin/teams/TeamTable";

// Mock teams data
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

export default function NewIdentityPage() {
  const router = useRouter();

  const handleSubmit = (data: Identity) => {
    console.log("Creating identity:", data);
    // In a real app, this would be an API call
    // await createIdentity(data);
    router.push("/admin/identities");
  };

  return (
    <div>
      <AdminHeader
        title="Add Identity"
        description="Create a new identity and map provider accounts."
      />
      <IdentityForm teams={MOCK_TEAMS} onSubmit={handleSubmit} />
    </div>
  );
}
