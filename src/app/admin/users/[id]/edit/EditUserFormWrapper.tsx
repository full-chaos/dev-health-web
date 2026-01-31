"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { UserForm, UserFormData } from "@/components/admin/users/UserForm";

type EditUserFormWrapperProps = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: "active" | "inactive" | "invited";
  };
};

export function EditUserFormWrapper({ user }: EditUserFormWrapperProps) {
  const router = useRouter();

  const handleSubmit = async (data: UserFormData) => {
    // Placeholder for API call
    console.log("Updating user:", user.id, data);
    // Simulate delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    router.push(`/admin/users/${user.id}`);
  };

  const handleCancel = () => {
    router.push(`/admin/users/${user.id}`);
  };

  return (
    <UserForm
      initialData={user}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      isEdit
    />
  );
}
