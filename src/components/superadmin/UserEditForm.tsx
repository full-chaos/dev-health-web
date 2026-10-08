"use client";

import { useState, type SyntheticEvent } from "react";
import { toast } from "sonner";
import { updateUser } from "@/lib/admin/server";
import type { User } from "@/lib/admin/types";

type UserEditFormProps = {
    user: User;
};

type FormValues = {
    email: string;
    username: string;
    full_name: string;
    is_active: boolean;
    is_verified: boolean;
    is_superuser: boolean;
};

function toFormValues(user: User): FormValues {
    return {
        email: user.email,
        username: user.username || "",
        full_name: user.full_name || "",
        is_active: user.is_active,
        is_verified: user.is_verified,
        is_superuser: user.is_superuser,
    };
}

export function UserEditForm({ user }: UserEditFormProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [values, setValues] = useState<FormValues>(() => toFormValues(user));

    async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsLoading(true);
        const result = await updateUser(user.id, {
            email: values.email,
            username: values.username || null,
            full_name: values.full_name || null,
            is_active: values.is_active,
            is_verified: values.is_verified,
            is_superuser: values.is_superuser,
        });
        setIsLoading(false);

        if (result.error) {
            toast.error(result.error);
            return;
        }
        if (result.data) {
            setValues(toFormValues(result.data));
        }
        toast.success("User updated successfully");
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">
                        Email
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        value={values.email}
                        onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                        required
                        className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent-2)"
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="username" className="text-sm font-medium">
                        Username
                    </label>
                    <input
                        id="username"
                        name="username"
                        value={values.username}
                        onChange={(e) => setValues((v) => ({ ...v, username: e.target.value }))}
                        className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent-2)"
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
                    value={values.full_name}
                    onChange={(e) => setValues((v) => ({ ...v, full_name: e.target.value }))}
                    className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent-2)"
                />
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <div className="flex items-center space-x-3 pt-4">
                    <input
                        type="checkbox"
                        id="is_active"
                        name="is_active"
                        checked={values.is_active}
                        onChange={(e) => setValues((v) => ({ ...v, is_active: e.target.checked }))}
                        className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-70) text-(--accent) focus:ring-(--accent-2)"
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
                        checked={values.is_verified}
                        onChange={(e) =>
                            setValues((v) => ({ ...v, is_verified: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-70) text-(--accent) focus:ring-(--accent-2)"
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
                        checked={values.is_superuser}
                        onChange={(e) =>
                            setValues((v) => ({ ...v, is_superuser: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-70) text-(--accent) focus:ring-(--accent-2)"
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
