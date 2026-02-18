import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UserTable } from "@/components/superadmin/UserTable";
import { listUsers } from "@/lib/admin/server";

export default async function UsersPage() {
  const { data: users, error } = await listUsers();

  if (error) {
    return (
      <div>
        <AdminHeader
          title="Users"
          description="Manage all users across the platform."
        />
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-500">
          Error loading users: {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <AdminHeader
        title="Users"
        description="Manage all users across the platform."
      >
        <Link
          href="/superadmin/users/new"
          className="inline-flex items-center rounded-xl bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
        >
          Create User
        </Link>
      </AdminHeader>
      <UserTable users={users || []} />
    </div>
  );
}
