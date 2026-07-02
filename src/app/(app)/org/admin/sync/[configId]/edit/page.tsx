import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncConfigForm } from "@/components/admin/sync/SyncConfigForm";
import { getSyncConfig, getSyncConfigRepositories, listCredentials } from "@/lib/admin/server";
import { RunBackfill } from "@/components/admin/sync/RunBackfill";

interface EditSyncConfigPageProps {
    params: Promise<{ configId: string }>;
    /** Gap-driven backfill deep link from the coverage timeline (CHAOS-2793). */
    searchParams: Promise<{ backfill_from?: string | string[]; backfill_to?: string | string[] }>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

export default async function EditSyncConfigPage({
    params,
    searchParams,
}: EditSyncConfigPageProps) {
    const { configId } = await params;
    const { backfill_from: backfillFromParam, backfill_to: backfillToParam } = await searchParams;
    const backfillFrom = firstParam(backfillFromParam);
    const backfillTo = firstParam(backfillToParam);
    const [configResult, credentialsResult, repositorySelectionResult] = await Promise.all([
        getSyncConfig(configId),
        listCredentials(),
        getSyncConfigRepositories(configId),
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
            />

            <div className="max-w-2xl">
                <RunBackfill
                    configId={configId}
                    initialSince={backfillFrom}
                    initialBefore={backfillTo}
                />
            </div>
        </div>
    );
}
