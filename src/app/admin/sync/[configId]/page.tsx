import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncStatusBadge } from "@/components/admin/sync/SyncStatusBadge";
import { getSyncConfig } from "@/lib/admin/server";
import { toSyncConfig } from "@/lib/sync-types";
import Link from "next/link";

interface PageProps {
  params: Promise<{ configId: string }>;
}

export default async function SyncConfigDetailPage({ params }: PageProps) {
  const { configId } = await params;
  const result = await getSyncConfig(configId);

  if (result.error || !result.data) {
    notFound();
  }

  const config = toSyncConfig(result.data);
  const apiConfig = result.data;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <AdminHeader
          title={config.name}
          description={`Provider: ${config.provider}`}
        />
        <Link
          href="/admin/sync"
          className="text-sm font-medium text-(--ink-muted) hover:text-foreground"
        >
          ← Back to List
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
          <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
            Current Status
          </h3>
          <div className="mt-2">
            <SyncStatusBadge status={config.status} className="text-sm px-3 py-1" />
          </div>
        </div>

        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
          <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
            Last Sync
          </h3>
          <p className="mt-2 text-lg font-medium text-foreground">
            {config.last_sync_at
              ? new Date(config.last_sync_at).toLocaleString()
              : "Never"}
          </p>
        </div>

        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
          <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
            Active
          </h3>
          <p className="mt-2 text-lg font-medium text-foreground">
            {apiConfig.is_active ? "Yes" : "No"}
          </p>
        </div>
      </div>

      {apiConfig.sync_targets.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
            Sync Targets
          </h3>
          <div className="flex flex-wrap gap-2">
            {apiConfig.sync_targets.map((target) => (
              <span
                key={target}
                className="rounded-full bg-(--card-70) px-3 py-1 text-xs font-medium text-foreground"
              >
                {target}
              </span>
            ))}
          </div>
        </div>
      )}

      {apiConfig.last_sync_error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500">
          <span className="font-medium">Last sync error:</span> {apiConfig.last_sync_error}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Job History</h2>
        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-8 text-center">
          <p className="text-sm text-(--ink-muted)">
            Job history is not yet available. Sync job tracking is coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
