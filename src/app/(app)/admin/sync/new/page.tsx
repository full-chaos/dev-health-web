import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncConfigForm } from "@/components/admin/sync/SyncConfigForm";
import { listCredentials } from "@/lib/admin/server";

export default async function NewSyncConfigPage() {
    const credentialsResult = await listCredentials();
    const credentials = credentialsResult.data || [];

    return (
        <div className="space-y-6">
            <AdminHeader
                title="New Sync Configuration"
                description="Configure a new data synchronization source."
            />

            <SyncConfigForm credentials={credentials} />
        </div>
    );
}
