import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { UserTable } from "@/components/admin/users/UserTable";
import { listUsers } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";

export default async function UsersPage() {
    const result = await listUsers();

    if (result.error) {
        return (
            <div>
                <AdminHeader
                    title="Users"
                    description="Manage organization members."
                />
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Failed to load users: {result.error}
                </div>
            </div>
        );
    }

    return (
        <div>
            <AdminHeader title="Users" description="Manage organization members.">
                <Link
                    href="/org/admin/users/new"
                    className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
                >
                    {CTA_LABELS.addUser}
                </Link>
            </AdminHeader>
            <UserTable users={result.data ?? []} />
        </div>
    );
}
