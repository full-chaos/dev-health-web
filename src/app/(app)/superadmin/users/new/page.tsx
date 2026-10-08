"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UserForm, UserFormData } from "@/components/admin/users/UserForm";
import { createPlatformUser } from "@/lib/admin/server";
import { ACTION_FAILED_MESSAGE } from "@/lib/actionFailure";

export default function NewPlatformUserPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (data: UserFormData) => {
        setIsLoading(true);
        try {
            const result = await createPlatformUser({
                email: data.email,
                password: data.password || undefined,
                full_name: data.full_name || undefined,
                username: data.username || undefined,
            });

            if (result.error) {
                toast.error(result.error);
                return;
            }

            router.push("/superadmin/users");
            router.refresh();
        } catch {
            toast.error(ACTION_FAILED_MESSAGE);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancel = () => {
        router.push("/superadmin/users");
    };

    return (
        <div className="max-w-2xl">
            <AdminHeader
                title="Create User"
                description="Create a platform user. The user is not added to any organization."
            />
            <UserForm onSubmit={handleSubmit} onCancel={handleCancel} isLoading={isLoading} />
        </div>
    );
}
