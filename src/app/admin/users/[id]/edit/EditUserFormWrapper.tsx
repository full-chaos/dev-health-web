"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserForm, UserFormData } from "@/components/admin/users/UserForm";
import { updateUser } from "@/lib/admin/server";
import type { User } from "@/lib/admin/types";

type EditUserFormWrapperProps = {
  user: User;
};

export function EditUserFormWrapper({ user }: EditUserFormWrapperProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: UserFormData) => {
    setIsLoading(true);
    setError(null);

    const result = await updateUser(user.id, {
      full_name: data.full_name || undefined,
      username: data.username || undefined,
      is_active: data.is_active,
    });

    setIsLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push(`/admin/users/${user.id}`);
    router.refresh();
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
      isLoading={isLoading}
      error={error}
    />
  );
}
