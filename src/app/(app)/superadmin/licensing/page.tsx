import { AdminHeader } from "@/components/admin/AdminHeader";
import { LicenseTable } from "@/components/superadmin/LicenseTable";
import { listOrganizations } from "@/lib/admin/server";

export default async function LicensingPage() {
    const { data: orgs, error } = await listOrganizations();

    if (error) {
        return (
            <div>
                <AdminHeader title="Licensing" description="Organization tiers and entitlements." />
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Error loading organizations: {error}
                </div>
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
