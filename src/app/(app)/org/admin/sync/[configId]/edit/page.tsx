import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncConfigForm } from "@/components/admin/sync/SyncConfigForm";
import {
    getAutoImportCapabilities,
    getSyncConfig,
    getSyncConfigRepositories,
    listCredentials,
} from "@/lib/admin/server";

interface EditSyncConfigPageProps {
    params: Promise<{ configId: string }>;
}

export default async function EditSyncConfigPage({ params }: EditSyncConfigPageProps) {
    const { configId } = await params;
    const [
        configResult,
        credentialsResult,
        repositorySelectionResult,
        autoImportCapabilitiesResult,
    ] = await Promise.all([
        getSyncConfig(configId),
        listCredentials(),
        getSyncConfigRepositories(configId),
        getAutoImportCapabilities(),
    ]);

    if (configResult.error || !configResult.data) {
        notFound();
    }

    const config = configResult.data;
    const credentials = credentialsResult.data || [];

    return (
        <div className="space-y-6">
            <AdminHeader
                title={`Edit ${config.name}`}
                description="Update sync configuration settings."
            />

            <SyncConfigForm
                initialData={config}
                initialRepositorySelection={repositorySelectionResult.data}
                credentials={credentials}
                // null (not {}) on a fetch error -- see new/page.tsx for why
                // this distinction matters on an edit save specifically.
                autoImportCapabilities={
                    autoImportCapabilitiesResult.error
                        ? null
                        : (autoImportCapabilitiesResult.data ?? {})
                }
            />
        </div>
    );
}
