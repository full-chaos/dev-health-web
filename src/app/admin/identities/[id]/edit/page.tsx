"use client";

import React from "react";
import { useRouter, useParams } from "next/navigation";
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

// Mock identities data
const MOCK_IDENTITIES: Record<string, Identity> = {
  "alice-smith": {
    canonical_id: "alice-smith",
    display_name: "Alice Smith",
    email: "alice@example.com",
    team_id: "platform-eng",
    provider_identities: [
      { provider: "github", username: "alicesmith" },
      { provider: "jira", username: "asmith" },
    ],
  },
  "bob-jones": {
    canonical_id: "bob-jones",
    display_name: "Bob Jones",
    email: "bob@example.com",
    team_id: "product-a",
    provider_identities: [
      { provider: "gitlab", username: "bobjones" },
      { provider: "email", username: "bob@example.com" },
    ],
  },
  "charlie-brown": {
    canonical_id: "charlie-brown",
    display_name: "Charlie Brown",
    email: "charlie@example.com",
    provider_identities: [
      { provider: "github", username: "cbrown" },
    ],
  },
};

export default function EditIdentityPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const identity = MOCK_IDENTITIES[id];

  const handleSubmit = (data: Identity) => {
    console.log("Updating identity:", data);
    // In a real app, this would be an API call
    // await updateIdentity(id, data);
    router.push("/admin/identities");
  };

  if (!identity) {
    return <div>Identity not found</div>;
  }

  return (
    <div>
      <AdminHeader
        title="Edit Identity"
        description={`Edit configuration for ${identity.display_name}`}
      />
      <IdentityForm
        initialData={identity}
        teams={MOCK_TEAMS}
        onSubmit={handleSubmit}
        isEditing
      />
    </div>
  );
}
