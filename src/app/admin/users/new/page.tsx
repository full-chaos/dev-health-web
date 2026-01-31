"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UserForm, UserFormData } from "@/components/admin/users/UserForm";

export default function NewUserPage() {
  const router = useRouter();

  const handleSubmit = async (data: UserFormData) => {
    // Placeholder for API call
    console.log("Creating user:", data);
    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    router.push("/admin/users");
  };

  const handleCancel = () => {
    router.push("/admin/users");
  };

  return (
    <div className="max-w-2xl">
      <AdminHeader
        title="Invite User"
        description="Send an invitation to a new team member."
      />
      <UserForm onSubmit={handleSubmit} onCancel={handleCancel} />
    </div>
  );
}
