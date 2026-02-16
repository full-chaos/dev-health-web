"use client";

import { useSession } from "next-auth/react";
import { startImpersonation } from "@/lib/admin/server";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/admin/types";

export function ImpersonateUserButton({ user }: { user: User }) {
  const { data: session, update } = useSession();
  const router = useRouter();

  const canImpersonate =
    session?.user?.id !== user.id &&
    !user.is_superuser &&
    user.role !== "admin";

  if (!canImpersonate) {
    return null;
  }

  const handleImpersonate = async () => {
    const result = await startImpersonation(user.id);
    if (result.data) {
      await update({ startImpersonation: result.data });
      router.push("/");
    }
  };

  return (
    <button
      type="button"
      onClick={handleImpersonate}
      className="block w-full rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-500 hover:bg-amber-500/20 text-left transition-colors"
    >
      Impersonate User
    </button>
  );
}
