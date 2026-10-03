import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { OrgTable } from "@/components/superadmin/OrgTable";
import { listOrganizations } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import { Notice } from "@/components/ui/Notice";

export default async function OrganizationsPage() {
    const { data: orgs, error } = await listOrganizations();

    if (error) {
        return (
            <div>
                <AdminHeader
                    title="Organizations"
                    description="Manage all organizations across the platform."
                />
                <Notice variant="danger" live={false}>
                    Error loading organizations. {READ_FAILED_MESSAGE}
                </Notice>
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
                    {CTA_LABELS.createOrganization}
                </Link>
            </AdminHeader>
            <OrgTable orgs={orgs || []} />
        </div>
    );
}
