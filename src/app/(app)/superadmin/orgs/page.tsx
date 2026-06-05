import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { OrgTable } from "@/components/superadmin/OrgTable";
import { listOrganizations } from "@/lib/admin/server";

export default async function OrganizationsPage() {
    const { data: orgs, error } = await listOrganizations();

    if (error) {
        return (
            <div>
                <AdminHeader
                    title="Organizations"
                    description="Manage all organizations across the platform."
                />
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Error loading organizations: {error}
                </div>
            </div>
        );
    }

    return (
        <div>
            <AdminHeader
                title="Organizations"
                description="Manage all organizations across the platform."
            >
                <Link
                    href="/superadmin/orgs/new"
                    className="inline-flex items-center rounded-xl bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
                >
                    Create Organization
                </Link>
            </AdminHeader>
            <OrgTable orgs={orgs || []} />
        </div>
    );
}
