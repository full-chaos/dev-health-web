import React from "react";
import Link from "next/link";

export type User = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: "active" | "inactive" | "invited";
  lastLogin?: string;
};

type UserTableProps = {
  users: User[];
};

export function UserTable({ users }: UserTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
          <tr>
            <th className="px-6 py-4 font-medium">Name</th>
            <th className="px-6 py-4 font-medium">Email</th>
            <th className="px-6 py-4 font-medium">Role</th>
            <th className="px-6 py-4 font-medium">Status</th>
            <th className="px-6 py-4 font-medium">Last Login</th>
            <th className="px-6 py-4 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--card-stroke)">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-(--card-70)/50">
              <td className="px-6 py-4 font-medium text-foreground">
                <Link href={`/admin/users/${user.id}`} className="hover:underline">
                  {user.name || "N/A"}
                </Link>
              </td>
              <td className="px-6 py-4 text-(--ink-muted)">{user.email}</td>
              <td className="px-6 py-4">
                <span className="inline-flex items-center rounded-full bg-(--accent)/10 px-2.5 py-0.5 text-xs font-medium text-(--accent)">
                  {user.role}
                </span>
              </td>
              <td className="px-6 py-4">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    user.status === "active"
                      ? "bg-green-500/10 text-green-500"
                      : user.status === "invited"
                      ? "bg-yellow-500/10 text-yellow-500"
                      : "bg-red-500/10 text-red-500"
                  }`}
                >
                  {user.status}
                </span>
              </td>
              <td className="px-6 py-4 text-(--ink-muted)">
                {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : "Never"}
              </td>
              <td className="px-6 py-4 text-right">
                <Link
                  href={`/admin/users/${user.id}/edit`}
                  className="text-(--accent) hover:underline"
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
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
