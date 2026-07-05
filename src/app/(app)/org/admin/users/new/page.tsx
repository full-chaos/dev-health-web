"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UserForm, UserFormData } from "@/components/admin/users/UserForm";
import { createUser } from "@/lib/admin/server";

export default function NewUserPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (data: UserFormData) => {
        setIsLoading(true);

        const result = await createUser({
            email: data.email,
            password: data.password || undefined,
            full_name: data.full_name || undefined,
            username: data.username || undefined,
        });

        setIsLoading(false);

        if (result.error) {
            toast.error(result.error);
            return;
        }

        router.push("/org/admin/users");
    };

    const handleCancel = () => {
        router.push("/org/admin/users");
    };

    return (
        <div className="max-w-2xl">
            <AdminHeader
                title="Add User"
                description="Add a new team member to the organization."
            />
            <UserForm onSubmit={handleSubmit} onCancel={handleCancel} isLoading={isLoading} />
        </div>
    );
}
