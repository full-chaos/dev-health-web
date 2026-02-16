"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateOrganization } from "@/lib/admin/server";
import type { Organization } from "@/lib/admin/types";

type OrgEditFormProps = {
  org: Organization;
};

export function OrgEditForm({ org }: OrgEditFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    const result = await updateOrganization(org.id, {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      tier: formData.get("tier") as string,
      is_active: formData.get("is_active") === "on",
    });
    setIsLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Organization updated successfully");
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
            defaultValue={org.name}
            required
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent)"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="slug" className="text-sm font-medium">
            Slug
          </label>
          <input
            id="slug"
            defaultValue={org.slug}
            disabled
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70)/50 px-3 py-2 text-sm text-(--ink-muted) outline-none"
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
          defaultValue={org.description || ""}
          rows={3}
          className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent)"
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
            defaultValue={org.tier}
            className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent)"
          >
            <option value="community">Community</option>
            <option value="team">Team</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <div className="flex items-center space-x-3 pt-8">
          <input
            type="checkbox"
            id="is_active"
            name="is_active"
            defaultChecked={org.is_active}
            className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-70) text-(--accent) focus:ring-(--accent)"
          />
          <label htmlFor="is_active" className="text-sm font-medium">
            Active
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
