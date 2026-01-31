import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncConfigCard } from "@/components/admin/sync/SyncConfigCard";
import { listSyncConfigs } from "@/lib/admin/server";
import { toSyncConfig } from "@/lib/sync-types";

export default async function SyncStatusPage() {
  const result = await listSyncConfigs();
  const configs = (result.data ?? []).map(toSyncConfig);

  return (
    <div className="space-y-8">
      <AdminHeader
        title="Sync Status"
        description="Monitor and manage data synchronization jobs."
      />

      {result.error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
          Failed to load sync configs: {result.error}
        </div>
      )}

      {configs.length === 0 && !result.error && (
        <div className="rounded-lg border border-(--card-stroke) bg-(--card-80) p-8 text-center text-(--ink-muted)">
          No sync configurations found. Configure integrations first.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {configs.map((config) => (
          <SyncConfigCard key={config.id} config={config} />
        ))}
      </div>
    </div>
  );
}
