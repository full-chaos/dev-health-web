import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncStatusBadge } from "@/components/admin/sync/SyncStatusBadge";
import { SyncJobHistory } from "@/components/admin/sync/SyncJobHistory";
import { SyncProgressBar } from "@/components/admin/sync/SyncProgressBar";
import { getSyncConfig, getSyncJobs, triggerSync, getCurrentOrg } from "@/lib/admin/server";

interface PageProps {
  params: Promise<{ configId: string }>;
}

export default async function SyncConfigDetailPage({ params }: PageProps) {
  const { configId } = await params;
  const [configResult, jobsResult, orgResult] = await Promise.all([
    getSyncConfig(configId),
    getSyncJobs(configId),
    getCurrentOrg(),
  ]);

  if (configResult.error || !configResult.data) {
    notFound();
  }

  const config = configResult.data;
  const jobs = jobsResult.data || [];
  const orgId = orgResult.data?.id || "";

  // Helper to trigger sync from server component (via form action)
  async function triggerSyncAction() {
    "use server";
    await triggerSync(configId);
  }

  const getStatus = () => {
    if (!config.last_sync_at) return "never";
    return config.last_sync_success ? "success" : "failed";
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <AdminHeader
          title={config.name}
          description={`Provider: ${config.provider}`}
        >
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/sync/${config.id}/edit`}
              className="rounded-md bg-(--card-70) px-4 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-60) hover:text-foreground"
            >
              Edit Config
            </Link>
            <form action={triggerSyncAction}>
              <button
                type="submit"
                className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent-hover)"
              >
                Sync Now
              </button>
            </form>
          </div>
        </AdminHeader>
      </div>

      <SyncProgressBar configId={config.id} provider={config.provider} orgId={orgId} />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
          <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
            Current Status
          </h3>
          <div className="mt-2">
            <SyncStatusBadge status={getStatus()} className="text-sm px-3 py-1" />
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
            {config.is_active ? "Yes" : "No"}
          </p>
        </div>
      </div>

      {config.sync_targets.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
            Sync Targets
          </h3>
          <div className="flex flex-wrap gap-2">
            {config.sync_targets.map((target) => (
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

      {config.last_sync_error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500">
          <span className="font-medium">Last sync error:</span> {config.last_sync_error}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Job History</h2>
        <SyncJobHistory jobs={jobs} />
      </div>
    </div>
  );
}
