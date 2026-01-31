import React from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { EditUserFormWrapper } from "./EditUserFormWrapper";

// Mock data fetcher
async function getUser(id: string) {
  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    id,
    name: "Alice Smith",
    email: "alice@example.com",
    role: "admin",
    status: "active" as const,
  };
}

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser(id);

  return (
    <div className="max-w-2xl">
      <AdminHeader
        title="Edit User"
        description={`Update details for ${user.name}`}
      />
      <EditUserFormWrapper user={user} />
    </div>
  );
}
