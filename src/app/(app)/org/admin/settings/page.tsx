import { AdminHeader } from "@/components/admin/AdminHeader";
import { GeneralSettings } from "@/components/admin/settings/GeneralSettings";
import { BillingSettings } from "@/components/admin/settings/BillingSettings";
import { SecuritySettings } from "@/components/admin/settings/SecuritySettings";
import { DangerZone } from "@/components/admin/settings/DangerZone";
import { getCurrentOrg } from "@/lib/admin/server";
import { DataState } from "@/components/ui/DataState";
import { RetryButton } from "@/components/ui/RetryButton";

export default async function OrganizationSettingsPage() {
    const result = await getCurrentOrg();
    const org = result.data;

    return (
        <div className="flex flex-col gap-6" data-testid="org-settings-page">
            <AdminHeader
                title="Organization"
                description="Manage your organization's profile, billing, and security settings."
            />

            {result.error && (
                <DataState
                    variant="error"
                    title="Organization settings could not be loaded"
                    message="The request failed. Retry, or check again in a moment."
                    action={<RetryButton />}
                    className=""
                />
            )}

            <div data-testid="org-settings-sections">
                <GeneralSettings org={org} />
                <BillingSettings tier={org?.tier} />
                <SecuritySettings />
                <DangerZone orgName={org?.name} />
            </div>
        </div>
    );
}
