import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UserTable } from "@/components/admin/users/UserTable";
import { listUsers } from "@/lib/admin/server";

export default async function UsersPage() {
  const result = await listUsers();

  if (result.error) {
    return (
      <div>
        <AdminHeader
          title="Users"
          description="Manage organization members and their roles."
        />
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
          Failed to load users: {result.error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <AdminHeader
        title="Users"
        description="Manage organization members and their roles."
      >
        <Link
          href="/admin/users/new"
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
        >
          Invite User
        </Link>
      </AdminHeader>

      <div className="mb-6 flex gap-4">
        <input
          type="text"
          placeholder="Search users..."
          className="w-full max-w-sm rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
        />
      </div>

      <UserTable users={result.data ?? []} />
    </div>
  );
}
