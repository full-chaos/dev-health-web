"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteOrganization } from "@/lib/admin/server";
import { SettingsSection } from "@/components/admin/settings/SettingsSection";

type OrgDeleteSectionProps = {
  orgId: string;
  orgSlug: string;
};

export function OrgDeleteSection({ orgId, orgSlug }: OrgDeleteSectionProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");

  async function handleDelete() {
    if (confirmSlug !== orgSlug) return;

    setIsDeleting(true);
    const result = await deleteOrganization(orgId);

    if (result.error) {
      toast.error(result.error);
      setIsDeleting(false);
    } else {
      toast.success("Organization deleted successfully");
      router.push("/superadmin/orgs");
    }
  }

  return (
    <SettingsSection
      title="Delete Organization"
      description="Permanently delete this organization and all its data. This action cannot be undone."
      danger
    >
      <div className="space-y-4">
        <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/20">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                Warning
              </h3>
              <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                <p>
                  This will permanently delete the organization <strong>{orgSlug}</strong> and remove all associated data, including teams, users, and metrics.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="confirm-slug" className="block text-sm font-medium text-(--foreground)">
            Type <span className="font-mono font-bold">{orgSlug}</span> to confirm
          </label>
          <div className="mt-1 flex gap-4">
            <input
              type="text"
              id="confirm-slug"
              value={confirmSlug}
              onChange={(e) => setConfirmSlug(e.target.value)}
              className="block w-full rounded-md border border-(--card-stroke) bg-(--background) px-3 py-2 text-(--foreground) shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder={orgSlug}
            />
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || confirmSlug !== orgSlug}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Delete Organization"}
            </button>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
