import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { getUser } from "@/lib/admin/server";
import { DeleteUserButton } from "./DeleteUserButton";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getUser(id);

  if (result.error || !result.data) {
    notFound();
  }

  const user = result.data;
  const statusLabel = !user.is_active ? "inactive" : !user.is_verified ? "invited" : "active";
  const statusClass = !user.is_active
    ? "bg-red-500/10 text-red-500"
    : !user.is_verified
    ? "bg-yellow-500/10 text-yellow-500"
    : "bg-green-500/10 text-green-500";

  return (
    <div>
      <AdminHeader
        title={user.full_name || user.username || user.email}
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
                <dd className="mt-1 text-sm font-medium">{user.full_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-sm text-(--ink-muted)">Username</dt>
                <dd className="mt-1 text-sm font-medium">{user.username || "—"}</dd>
              </div>
              <div>
                <dt className="text-sm text-(--ink-muted)">Email Address</dt>
                <dd className="mt-1 text-sm font-medium">{user.email}</dd>
              </div>
              <div>
                <dt className="text-sm text-(--ink-muted)">Auth Provider</dt>
                <dd className="mt-1 text-sm font-medium capitalize">{user.auth_provider}</dd>
              </div>
              <div>
                <dt className="text-sm text-(--ink-muted)">Status</dt>
                <dd className="mt-1">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}
                  >
                    {statusLabel}
                  </span>
                  {user.is_superuser && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-500">
                      superuser
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-(--ink-muted)">Last Login</dt>
                <dd className="mt-1 text-sm font-medium">
                  {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-(--ink-muted)">Created</dt>
                <dd className="mt-1 text-sm font-medium">
                  {new Date(user.created_at).toLocaleDateString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-(--ink-muted)">Updated</dt>
                <dd className="mt-1 text-sm font-medium">
                  {new Date(user.updated_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
            <h3 className="mb-4 text-lg font-medium">Quick Actions</h3>
            <div className="space-y-3">
              <Link
                href={`/admin/users/${user.id}/edit`}
                className="block w-full rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-70) hover:text-foreground text-left"
              >
                Edit Profile
              </Link>
              <DeleteUserButton userId={user.id} userEmail={user.email} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
