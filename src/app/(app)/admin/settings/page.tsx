import { AdminHeader } from "@/components/admin/AdminHeader";
import { GeneralSettings } from "@/components/admin/settings/GeneralSettings";
import { BillingSettings } from "@/components/admin/settings/BillingSettings";
import { SecuritySettings } from "@/components/admin/settings/SecuritySettings";
import { DangerZone } from "@/components/admin/settings/DangerZone";
import { getCurrentOrg } from "@/lib/admin/server";

export default async function OrganizationSettingsPage() {
    const result = await getCurrentOrg();
    const org = result.data;

    return (
        <div>
            <AdminHeader
                title="Organization Settings"
                description="Manage your organization's profile, billing, and security settings."
            />

            {result.error && (
                <div className="mb-6 max-w-4xl rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Failed to load organization: {result.error}
                </div>
            )}

            <div className="max-w-4xl">
                <GeneralSettings org={org} />
                <BillingSettings tier={org?.tier} />
                <SecuritySettings />
                <DangerZone orgName={org?.name} />
            </div>
        </div>
    );
}
