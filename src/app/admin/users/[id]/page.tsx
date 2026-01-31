import React from "react";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";

// Mock data fetcher
async function getUser(id: string) {
  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    id,
    name: "Alice Smith",
    email: "alice@example.com",
    role: "admin",
    status: "active",
    lastLogin: "2023-10-25T10:00:00Z",
    joinedAt: "2023-01-15T08:00:00Z",
  };
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser(id);

  return (
    <div>
      <AdminHeader
        title={user.name || "User Details"}
        description={`Manage settings for ${user.email}`}
      >
        <Link
          href={`/admin/users/${user.id}/edit`}
          className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm font-medium text-foreground hover:bg-(--card-stroke)"
        >
          Edit User
        </Link>
      </AdminHeader>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
            <h3 className="mb-4 text-lg font-medium">Profile Information</h3>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-(--ink-muted)">Full Name</dt>
                <dd className="mt-1 text-sm font-medium">{user.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-(--ink-muted)">Email Address</dt>
                <dd className="mt-1 text-sm font-medium">{user.email}</dd>
              </div>
              <div>
                <dt className="text-sm text-(--ink-muted)">Role</dt>
                <dd className="mt-1 text-sm font-medium capitalize">{user.role}</dd>
              </div>
              <div>
                <dt className="text-sm text-(--ink-muted)">Status</dt>
                <dd className="mt-1">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      user.status === "active"
                        ? "bg-green-500/10 text-green-500"
                        : "bg-red-500/10 text-red-500"
                    }`}
                  >
                    {user.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-(--ink-muted)">Last Login</dt>
                <dd className="mt-1 text-sm font-medium">
                  {new Date(user.lastLogin).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-(--ink-muted)">Joined</dt>
                <dd className="mt-1 text-sm font-medium">
                  {new Date(user.joinedAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
            <h3 className="mb-4 text-lg font-medium">Activity Log</h3>
            <div className="text-sm text-(--ink-muted)">
              <p>No recent activity found.</p>
              {/* Placeholder for activity log */}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
            <h3 className="mb-4 text-lg font-medium">Quick Actions</h3>
            <div className="space-y-3">
              <button className="w-full rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-70) hover:text-foreground text-left">
                Reset Password
              </button>
              <button className="w-full rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-70) hover:text-foreground text-left">
                Revoke Access
              </button>
              <button className="w-full rounded-lg border border-red-500/20 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 text-left">
                Delete User
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
