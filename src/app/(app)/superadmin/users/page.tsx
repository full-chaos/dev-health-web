import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UserTable } from "@/components/superadmin/UserTable";
import { listPlatformUsers } from "@/lib/admin/server";

type UsersPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const params = (await searchParams) ?? {};
  const queryParam = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = typeof queryParam === "string" ? queryParam.trim() : "";
  const { data: users, error } = await listPlatformUsers(query || undefined);

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
        <div className="flex flex-wrap items-center gap-3">
          <form action="/superadmin/users" method="get" className="flex items-center gap-2">
            <input
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Search users..."
              className="w-64 rounded-xl border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
            />
            <button
              type="submit"
              className="inline-flex items-center rounded-xl border border-(--card-stroke) px-3 py-2 text-sm font-medium text-foreground hover:bg-(--card-70)"
            >
              Search
            </button>
          </form>
          <Link
            href="/superadmin/users/new"
            className="inline-flex items-center rounded-xl bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
          >
            Create User
          </Link>
        </div>
      </AdminHeader>
      <UserTable users={users || []} />
    </div>
  );
}
