import Link from "next/link";
import { Plus } from "lucide-react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncConfigTable } from "@/components/admin/sync/SyncConfigTable";
import { buttonClassName } from "@/components/shared/Button";
import { DataState } from "@/components/ui/DataState";
import { RetryButton } from "@/components/ui/RetryButton";
import { listSyncConfigs } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import { logger } from "@/lib/logger";

export default async function SyncStatusPage() {
    const result = await listSyncConfigs();
    const configs = result.data ?? [];
    // The backend text goes to the server log, never to the page (A11: one plain sentence + Retry).
    if (result.error) logger.error({ err: result.error }, "Failed to load sync configurations");

    return (
        <div className="space-y-8">
            <AdminHeader
                title="Connections"
                description="Monitor and manage data synchronization jobs."
            >
                <Link href="/org/admin/sync/new" className={buttonClassName("primary", "md")}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    {CTA_LABELS.newSyncConfig}
                </Link>
            </AdminHeader>

            {result.error && (
                <DataState
                    variant="error"
                    title="Sync configurations unavailable"
                    message="Sync configurations could not be loaded. Retry, or check again in a moment."
                    action={<RetryButton />}
                />
            )}
            {(!result.error || configs.length > 0) && <SyncConfigTable configs={configs} />}
        </div>
    );
}
