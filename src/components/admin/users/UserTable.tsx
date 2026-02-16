"use client";

import React from "react";
import Link from "next/link";
import type { User } from "@/lib/admin/types";
import { useSession } from "next-auth/react";
import { startImpersonation } from "@/lib/admin/server";
import { useRouter } from "next/navigation";

export type { User };

type UserTableProps = {
  users: User[];
};

function getStatusDisplay(user: User): { label: string; className: string } {
  if (!user.is_active) {
    return { label: "inactive", className: "bg-red-500/10 text-red-500" };
  }
  if (!user.is_verified) {
    return { label: "invited", className: "bg-yellow-500/10 text-yellow-500" };
  }
  return { label: "active", className: "bg-green-500/10 text-green-500" };
}

export function UserTable({ users }: UserTableProps) {
  const { data: session, update } = useSession();
  const router = useRouter();

  const handleImpersonate = async (userId: string) => {
    const result = await startImpersonation(userId);
    if (result.data) {
      await update({ startImpersonation: result.data });
      router.push("/");
    }
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
          <tr>
            <th className="px-6 py-4 font-medium">Name</th>
            <th className="px-6 py-4 font-medium">Email</th>
            <th className="px-6 py-4 font-medium">Auth</th>
            <th className="px-6 py-4 font-medium">Status</th>
            <th className="px-6 py-4 font-medium">Last Login</th>
            <th className="px-6 py-4 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--card-stroke)">
          {users.map((user) => {
            const status = getStatusDisplay(user);
            const canImpersonate =
              session?.user?.id !== user.id &&
              !user.is_superuser &&
              user.role !== "admin";

            return (
              <tr key={user.id} className="hover:bg-(--card-70)/50">
                <td className="px-6 py-4 font-medium text-foreground">
                  <Link href={`/admin/users/${user.id}`} className="hover:underline">
                    {user.full_name || user.username || "N/A"}
                  </Link>
                </td>
                <td className="px-6 py-4 text-(--ink-muted)">{user.email}</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center rounded-full bg-(--accent)/10 px-2.5 py-0.5 text-xs font-medium text-(--accent)">
                    {user.auth_provider}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                </td>
                <td className="px-6 py-4 text-(--ink-muted)">
                  {user.last_login_at
                    ? new Date(user.last_login_at).toLocaleDateString()
                    : "Never"}
                </td>
                <td className="px-6 py-4 text-right space-x-4">
                  {canImpersonate && (
                    <button
                      type="button"
                      onClick={() => handleImpersonate(user.id)}
                      className="text-amber-500 hover:underline"
                    >
                      Impersonate
                    </button>
                  )}
                  <Link
                    href={`/admin/users/${user.id}/edit`}
                    className="text-(--accent) hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            );
          })}
          {users.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-8 text-center text-(--ink-muted)">
                No users found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
