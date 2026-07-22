import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncConfigForm } from "@/components/admin/sync/SyncConfigForm";
import { getCanonicalIncidentIngestionEntitlement, listCredentials } from "@/lib/admin/server";
import { resolvePagerDutySyncConfigPreselection } from "@/lib/admin/syncConfigPreselection";

type NewSyncConfigPageProps = {
    searchParams: Promise<{
        provider?: string | string[];
        credential_name?: string | string[];
    }>;
};

export default async function NewSyncConfigPage({ searchParams }: NewSyncConfigPageProps) {
    const [credentialsResult, incidentEntitlementResult] = await Promise.all([
        listCredentials(),
        getCanonicalIncidentIngestionEntitlement(),
    ]);
    const credentials = credentialsResult.data || [];
    const canCreatePagerDuty = incidentEntitlementResult.data?.enabled === true;
    const initialSelection = resolvePagerDutySyncConfigPreselection(
        await searchParams,
        credentials,
        canCreatePagerDuty,
    );

    return (
        <div className="space-y-6">
            <AdminHeader
                title="New Sync Configuration"
                description="Configure a new data synchronization source."
            />

            <SyncConfigForm
                canCreatePagerDuty={canCreatePagerDuty}
                credentials={credentials}
                initialSelection={initialSelection ?? undefined}
            />
        </div>
    );
}
