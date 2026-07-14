import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncConfigTable } from "@/components/admin/sync/SyncConfigTable";
import { DataState } from "@/components/ui/DataState";
import { listSyncConfigs } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";

export default async function SyncStatusPage() {
    const result = await listSyncConfigs();
    const configs = result.data ?? [];

    return (
        <div className="space-y-8">
            <AdminHeader
                title="Sync Status"
                description="Monitor and manage data synchronization jobs."
            >
                <Link
                    href="/org/admin/sync/new"
                    className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-80 active:opacity-70 transition-opacity"
                >
                    {CTA_LABELS.newSyncConfig}
                </Link>
            </AdminHeader>

            {result.error && (
                <DataState
                    variant="error"
                    title="Sync configurations unavailable"
                    message={`Failed to load sync configurations: ${result.error}`}
                />
            )}
            {(!result.error || configs.length > 0) && <SyncConfigTable configs={configs} />}
        </div>
    );
}
