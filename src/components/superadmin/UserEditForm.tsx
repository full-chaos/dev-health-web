"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateUser } from "@/lib/admin/server";
import type { User } from "@/lib/admin/types";

type UserEditFormProps = {
    user: User;
};

export function UserEditForm({ user }: UserEditFormProps) {
    const [isLoading, setIsLoading] = useState(false);

    async function handleSubmit(formData: FormData) {
        setIsLoading(true);
        const result = await updateUser(user.id, {
            email: formData.get("email") as string,
            username: (formData.get("username") as string) || null,
            full_name: (formData.get("full_name") as string) || null,
            is_active: formData.get("is_active") === "on",
            is_verified: formData.get("is_verified") === "on",
            is_superuser: formData.get("is_superuser") === "on",
        });
        setIsLoading(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success("User updated successfully");
        }
    }

    return (
        <form action={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">
                        Email
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        defaultValue={user.email}
                        required
                        className="w-full rounded-lg border border-(--border) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent)"
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="username" className="text-sm font-medium">
                        Username
                    </label>
                    <input
                        id="username"
                        name="username"
                        defaultValue={user.username || ""}
                        className="w-full rounded-lg border border-(--border) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent)"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label htmlFor="full_name" className="text-sm font-medium">
                    Full Name
                </label>
                <input
                    id="full_name"
                    name="full_name"
                    defaultValue={user.full_name || ""}
                    className="w-full rounded-lg border border-(--border) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent)"
                />
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <div className="flex items-center space-x-3 pt-4">
                    <input
                        type="checkbox"
                        id="is_active"
                        name="is_active"
                        defaultChecked={user.is_active}
                        className="h-4 w-4 rounded border-(--border) bg-(--card-70) text-(--accent) focus:ring-(--accent)"
                    />
                    <label htmlFor="is_active" className="text-sm font-medium">
                        Active
                    </label>
                </div>
                <div className="flex items-center space-x-3 pt-4">
                    <input
                        type="checkbox"
                        id="is_verified"
                        name="is_verified"
                        defaultChecked={user.is_verified}
                        className="h-4 w-4 rounded border-(--border) bg-(--card-70) text-(--accent) focus:ring-(--accent)"
                    />
                    <label htmlFor="is_verified" className="text-sm font-medium">
                        Verified
                    </label>
                </div>
                <div className="flex items-center space-x-3 pt-4">
                    <input
                        type="checkbox"
                        id="is_superuser"
                        name="is_superuser"
                        defaultChecked={user.is_superuser}
                        className="h-4 w-4 rounded border-(--border) bg-(--card-70) text-(--accent) focus:ring-(--accent)"
                    />
                    <label htmlFor="is_superuser" className="text-sm font-medium">
                        Superuser
                    </label>
                </div>
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isLoading}
                    className="rounded-xl bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
                >
                    {isLoading ? "Saving..." : "Save Changes"}
                </button>
            </div>
        </form>
    );
}
