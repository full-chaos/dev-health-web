"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SettingsSection } from "./SettingsSection";
import { updateOrgProfile } from "@/lib/admin/server";
import type { Organization } from "@/lib/admin/types";

type GeneralSettingsProps = {
    org?: Organization;
};

export function GeneralSettings({ org }: GeneralSettingsProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const result = await updateOrgProfile({
            name: formData.get("name") as string,
            description: (formData.get("description") as string) || undefined,
        });

        setIsLoading(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success("Settings saved successfully");
        }
    };

    return (
        <SettingsSection
            title="General Settings"
            description="Manage your organization's basic information."
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-(--foreground)">
                        Organization Name
                    </label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        defaultValue={org?.name ?? ""}
                        disabled={isLoading}
                        className="mt-1 block w-full rounded-md border border-(--card-stroke) bg-(--background) px-3 py-2 text-(--foreground) shadow-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent) disabled:opacity-50"
                    />
                </div>
                <div>
                    <label htmlFor="slug" className="block text-sm font-medium text-(--foreground)">
                        Slug
                    </label>
                    <input
                        type="text"
                        id="slug"
                        name="slug"
                        defaultValue={org?.slug ?? ""}
                        disabled
                        className="mt-1 block w-full rounded-md border border-(--card-stroke) bg-(--background) px-3 py-2 text-(--ink-muted) shadow-sm opacity-50 cursor-not-allowed"
                    />
                </div>
                <div>
                    <label
                        htmlFor="description"
                        className="block text-sm font-medium text-(--foreground)"
                    >
                        Description
                    </label>
                    <textarea
                        id="description"
                        name="description"
                        rows={3}
                        defaultValue={org?.description ?? ""}
                        disabled={isLoading}
                        className="mt-1 block w-full rounded-md border border-(--card-stroke) bg-(--background) px-3 py-2 text-(--foreground) shadow-sm focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent) disabled:opacity-50"
                    />
                </div>
                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2 disabled:opacity-50"
                    >
                        {isLoading ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </form>
        </SettingsSection>
    );
}
