"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteUser } from "@/lib/admin/server";

type DeleteUserButtonProps = {
  userId: string;
  userEmail: string;
};

export function DeleteUserButton({ userId, userEmail }: DeleteUserButtonProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);

    const result = await deleteUser(userId);

    if (result.error) {
      toast.error(result.error);
      setIsDeleting(false);
      return;
    }

    router.push("/admin/users");
    router.refresh();
  };

  if (isConfirming) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-500">Delete {userEmail}?</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {isDeleting ? "Deleting..." : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setIsConfirming(false)}
            disabled={isDeleting}
            className="flex-1 rounded-lg border border-(--card-stroke) px-3 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-70)"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsConfirming(true)}
      className="w-full rounded-lg border border-red-500/20 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 text-left"
    >
      Delete User
    </button>
  );
}
