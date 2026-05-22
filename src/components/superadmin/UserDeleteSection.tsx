"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteUser } from "@/lib/admin/server";
import { SettingsSection } from "@/components/admin/settings/SettingsSection";

type UserDeleteSectionProps = {
  userId: string;
  userEmail: string;
};

export function UserDeleteSection({ userId, userEmail }: UserDeleteSectionProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");

  async function handleDelete() {
    if (confirmEmail !== userEmail) return;

    setIsDeleting(true);
    const result = await deleteUser(userId);

    if (result.error) {
      toast.error(result.error);
      setIsDeleting(false);
    } else {
      toast.success("User deleted successfully");
      router.push("/superadmin/users");
    }
  }

  return (
    <SettingsSection
      title="Delete User"
      description="Permanently delete this user and all their data. This action cannot be undone."
      danger
    >
      <div className="space-y-4">
        <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/20">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Warning</h3>
              <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                <p>
                  This will permanently delete the user <strong>{userEmail}</strong> and remove all
                  associated data.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="confirm-email" className="block text-sm font-medium text-(--foreground)">
            Type <span className="font-mono font-bold">{userEmail}</span> to confirm
          </label>
          <div className="mt-1 flex gap-4">
            <input
              type="text"
              id="confirm-email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="block w-full rounded-md border border-(--card-stroke) bg-(--background) px-3 py-2 text-(--foreground) shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder={userEmail}
            />
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || confirmEmail !== userEmail}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : "Delete User"}
            </button>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
