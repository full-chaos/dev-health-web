"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UserForm, UserFormData } from "@/components/admin/users/UserForm";
import { ACTION_FAILED_MESSAGE } from "@/lib/actionFailure";
import { createUser } from "@/lib/admin/server";
import { logger } from "@/lib/logger";

export default function NewUserPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (data: UserFormData) => {
        setIsLoading(true);

        let result: Awaited<ReturnType<typeof createUser>>;
        try {
            result = await createUser({
                email: data.email,
                password: data.password || undefined,
                full_name: data.full_name || undefined,
                username: data.username || undefined,
                role: data.role ?? "member",
            });
        } catch (err) {
            // A thrown server action (network, a stale action id after a deploy) never reaches
            // withErrorHandling; without this catch the add fails with no message.
            logger.error({ err, operation: "createUser" }, "Add user action threw");
            setIsLoading(false);
            toast.error(ACTION_FAILED_MESSAGE);
            return;
        }

        setIsLoading(false);

        if (result.error) {
            toast.error(result.error);
            return;
        }

        toast.success(`Added ${result.data?.email ?? data.email}`);
        router.push("/org/admin/users");
        router.refresh();
    };

    const handleCancel = () => {
        router.push("/org/admin/users");
    };

    return (
        <div>
            <AdminHeader
                title="Add User"
                description="Add a new team member to the organization."
            />
            <UserForm
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                isLoading={isLoading}
                withRole
            />
        </div>
    );
}
