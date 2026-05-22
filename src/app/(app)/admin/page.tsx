import { auth } from "@/lib/auth";
import { AdminHeader } from "@/components/admin/AdminHeader";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="space-y-8">
      <AdminHeader
        title="Admin Dashboard"
        description={`Welcome back, ${user?.name || user?.email}.`}
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
          <h3 className="font-medium text-foreground">User Management</h3>
          <p className="mt-2 text-sm text-(--ink-muted)">
            Manage users, roles, and permissions across the organization.
          </p>
          <div className="mt-4">
            <Link
              href="/admin/users"
              className="text-sm font-medium text-(--accent) hover:underline"
            >
              Manage Users →
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
          <h3 className="font-medium text-foreground">Integrations</h3>
          <p className="mt-2 text-sm text-(--ink-muted)">
            Configure connections to GitHub, GitLab, Jira, and other tools.
          </p>
          <div className="mt-4">
            <Link
              href="/admin/integrations"
              className="text-sm font-medium text-(--accent) hover:underline"
            >
              Configure Integrations →
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
          <h3 className="font-medium text-foreground">Sync Status</h3>
          <p className="mt-2 text-sm text-(--ink-muted)">
            Monitor data synchronization jobs and troubleshoot issues.
          </p>
          <div className="mt-4">
            <Link
              href="/admin/sync"
              className="text-sm font-medium text-(--accent) hover:underline"
            >
              View Sync Status →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
