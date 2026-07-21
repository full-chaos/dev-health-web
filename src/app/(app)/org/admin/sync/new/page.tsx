import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncConfigForm } from "@/components/admin/sync/SyncConfigForm";
import { getCanonicalIncidentIngestionEntitlement, listCredentials } from "@/lib/admin/server";

export default async function NewSyncConfigPage() {
    const [credentialsResult, incidentEntitlementResult] = await Promise.all([
        listCredentials(),
        getCanonicalIncidentIngestionEntitlement(),
    ]);
    const credentials = credentialsResult.data || [];

    return (
        <div className="space-y-6">
            <AdminHeader
                title="New Sync Configuration"
                description="Configure a new data synchronization source."
            />

            <SyncConfigForm
                canCreatePagerDuty={incidentEntitlementResult.data?.enabled === true}
                credentials={credentials}
            />
        </div>
    );
}
