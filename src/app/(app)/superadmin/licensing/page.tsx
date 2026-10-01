import { AdminHeader } from "@/components/admin/AdminHeader";
import { LicenseTable } from "@/components/superadmin/LicenseTable";
import { listOrganizations } from "@/lib/admin/server";
import { Notice } from "@/components/ui/Notice";

export default async function LicensingPage() {
    const { data: orgs, error } = await listOrganizations();

    if (error) {
        return (
            <div>
                <AdminHeader title="Licensing" description="Organization tiers and entitlements." />
                <Notice variant="danger" live={false}>
                    Error loading organizations: {error}
                </Notice>
            </div>
        );
    }

    return (
        <div>
            <AdminHeader title="Licensing" description="Organization tiers and entitlements." />
            <LicenseTable orgs={orgs || []} />
        </div>
    );
}
