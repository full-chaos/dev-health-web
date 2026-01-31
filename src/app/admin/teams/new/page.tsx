"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { TeamForm } from "@/components/admin/teams/TeamForm";
import { Team } from "@/components/admin/teams/TeamTable";

export default function NewTeamPage() {
  const router = useRouter();

  const handleSubmit = (data: Team) => {
    console.log("Creating team:", data);
    // In a real app, this would be an API call
    // await createTeam(data);
    router.push("/admin/teams");
  };

  return (
    <div>
      <AdminHeader
        title="Add Team"
        description="Create a new team and define its resource ownership."
      />
      <TeamForm onSubmit={handleSubmit} />
    </div>
  );
}
