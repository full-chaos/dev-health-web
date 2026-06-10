"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createOrganization } from "@/lib/admin/server";

export function OrgCreateForm() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

    function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
        const newName = e.target.value;
        setName(newName);
        if (!isSlugManuallyEdited) {
            setSlug(
                newName
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, ""),
            );
        }
    }

    function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
        setSlug(e.target.value);
        setIsSlugManuallyEdited(true);
    }

    async function handleSubmit(formData: FormData) {
        setIsLoading(true);
        const result = await createOrganization({
            name: formData.get("name") as string,
            slug: formData.get("slug") as string,
            description: (formData.get("description") as string) || null,
            tier: formData.get("tier") as string,
            owner_user_id: (formData.get("owner_user_id") as string) || null,
        });
        setIsLoading(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success("Organization created successfully");
            router.push(`/superadmin/orgs/${result.data?.id}`);
        }
    }

    return (
        <form action={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium">
                        Organization Name
                    </label>
                    <input
                        id="name"
                        name="name"
                        value={name}
                        onChange={handleNameChange}
                        required
                        className="w-full rounded-lg border border-(--border) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent)"
                        placeholder="Acme Corp"
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="slug" className="text-sm font-medium">
                        Slug
                    </label>
                    <input
                        id="slug"
                        name="slug"
                        value={slug}
                        onChange={handleSlugChange}
                        required
                        className="w-full rounded-lg border border-(--border) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent)"
                        placeholder="acme-corp"
                    />
                </div>
            </div>

            <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">
                    Description
                </label>
                <textarea
                    id="description"
                    name="description"
                    rows={3}
                    className="w-full rounded-lg border border-(--border) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent)"
                    placeholder="Optional description"
                />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                    <label htmlFor="tier" className="text-sm font-medium">
                        Tier
                    </label>
                    <select
                        id="tier"
                        name="tier"
                        defaultValue="community"
                        className="w-full rounded-lg border border-(--border) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent)"
                    >
                        <option value="community">Community</option>
                        <option value="team">Team</option>
                        <option value="enterprise">Enterprise</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label htmlFor="owner_user_id" className="text-sm font-medium">
                        Owner User ID (Optional)
                    </label>
                    <input
                        id="owner_user_id"
                        name="owner_user_id"
                        className="w-full rounded-lg border border-(--border) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent)"
                        placeholder="UUID of initial owner"
                    />
                </div>
            </div>

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={isLoading}
                    className="rounded-xl bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
                >
                    {isLoading ? "Creating..." : "Create Organization"}
                </button>
            </div>
        </form>
    );
}
