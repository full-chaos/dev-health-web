import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncConfigForm } from "@/components/admin/sync/SyncConfigForm";
import {
    getAutoImportCapabilities,
    getCanonicalIncidentIngestionEntitlement,
    listCredentials,
} from "@/lib/admin/server";

export default async function NewSyncConfigPage() {
    const [credentialsResult, incidentEntitlementResult, autoImportCapabilitiesResult] =
        await Promise.all([
            listCredentials(),
            getCanonicalIncidentIngestionEntitlement(),
            getAutoImportCapabilities(),
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
                // null (not {}) on a fetch error -- a distinct sentinel
                // meaning "unknown", not "confirmed no support" (CHAOS-4323
                // codex round: collapsing them risks deleting an existing
                // config's auto-import flags on the next edit save).
                autoImportCapabilities={
                    autoImportCapabilitiesResult.error
                        ? null
                        : (autoImportCapabilitiesResult.data ?? {})
                }
            />
        </div>
    );
}
