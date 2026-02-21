"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { User } from "@/lib/admin/types";
import { useSession } from "next-auth/react";
import { startImpersonation } from "@/lib/admin/server";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type UserTableProps = {
  users: User[];
};

export function UserTable({ users }: UserTableProps) {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const handleImpersonate = async (userId: string) => {
    setImpersonatingId(userId);
    try {
      const result = await startImpersonation(userId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.data) {
        await update({ startImpersonation: result.data });
        router.push("/dashboard");
      }
    } catch {
      toast.error("Failed to start impersonation");
    } finally {
      setImpersonatingId(null);
    }
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
          <tr>
            <th className="px-6 py-4 font-medium">Name / Email</th>
            <th className="px-6 py-4 font-medium">Username</th>
            <th className="px-6 py-4 font-medium">Auth Provider</th>
            <th className="px-6 py-4 font-medium">Status</th>
            <th className="px-6 py-4 font-medium">Role</th>
            <th className="px-6 py-4 font-medium">Last Login</th>
            <th className="px-6 py-4 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--card-stroke)">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-(--card-70)/50">
              <td className="px-6 py-4 font-medium text-foreground">
                <Link href={`/superadmin/users/${user.id}`} className="hover:underline">
                  <div className="font-medium">{user.full_name || "No Name"}</div>
                  <div className="text-xs text-(--ink-muted)">{user.email}</div>
                </Link>
              </td>
              <td className="px-6 py-4 text-(--ink-muted)">{user.username || "-"}</td>
              <td className="px-6 py-4 text-(--ink-muted)">{user.auth_provider}</td>
              <td className="px-6 py-4">
                <div className="flex gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user.is_active
                        ? "bg-green-500/10 text-green-500"
                        : "bg-red-500/10 text-red-500"
                    }`}
                  >
                    {user.is_active ? "active" : "inactive"}
                  </span>
                  {user.is_verified && (
                    <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-500">
                      verified
                    </span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4">
                {user.is_superuser && (
                  <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-500">
                    superuser
                  </span>
                )}
              </td>
              <td className="px-6 py-4 text-(--ink-muted)">
                {user.last_login_at
                  ? new Date(user.last_login_at).toLocaleDateString()
                  : "-"}
              </td>
              <td className="px-6 py-4 text-right space-x-4">
                {session?.user?.id !== user.id && !user.is_superuser && (
                  <button
                    type="button"
                    onClick={() => handleImpersonate(user.id)}
                    disabled={impersonatingId === user.id}
                    className="text-amber-500 hover:underline disabled:opacity-50"
                  >
                    {impersonatingId === user.id ? "Impersonating…" : "Impersonate"}
                  </button>
                )}
                <Link
                  href={`/superadmin/users/${user.id}`}
                  className="text-(--accent) hover:underline"
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-8 text-center text-(--ink-muted)">
                No users found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
