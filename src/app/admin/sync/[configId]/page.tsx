import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncJobHistory } from "@/components/admin/sync/SyncJobHistory";
import { SyncStatusBadge } from "@/components/admin/sync/SyncStatusBadge";
import { SyncConfig, SyncJob } from "@/lib/sync-types";
import Link from "next/link";

// Mock data (should match the list page for consistency)
const mockConfigs: Record<string, SyncConfig> = {
  "gh-main": {
    id: "gh-main",
    name: "GitHub Main Repo",
    provider: "github",
    last_sync_at: "2023-10-27T10:00:00Z",
    status: "success",
    schedule: "Every 1 hour",
  },
  "jira-corp": {
    id: "jira-corp",
    name: "Corporate Jira",
    provider: "jira",
    last_sync_at: "2023-10-27T09:30:00Z",
    status: "failed",
    schedule: "Every 4 hours",
  },
  "gl-legacy": {
    id: "gl-legacy",
    name: "Legacy GitLab",
    provider: "gitlab",
    last_sync_at: null,
    status: "never",
    schedule: "Daily",
  },
  "local-dev": {
    id: "local-dev",
    name: "Local Development",
    provider: "local",
    last_sync_at: "2023-10-27T10:15:00Z",
    status: "running",
  },
};

const mockJobs: Record<string, SyncJob[]> = {
  "gh-main": [
    {
      id: "job-1",
      config_id: "gh-main",
      started_at: "2023-10-27T10:00:00Z",
      completed_at: "2023-10-27T10:02:30Z",
      status: "success",
      items_synced: 150,
      errors: [],
    },
    {
      id: "job-2",
      config_id: "gh-main",
      started_at: "2023-10-27T09:00:00Z",
      completed_at: "2023-10-27T09:02:15Z",
      status: "success",
      items_synced: 45,
      errors: [],
    },
  ],
  "jira-corp": [
    {
      id: "job-3",
      config_id: "jira-corp",
      started_at: "2023-10-27T09:30:00Z",
      completed_at: "2023-10-27T09:30:45Z",
      status: "failed",
      items_synced: 10,
      errors: ["API Rate Limit Exceeded", "Connection Timeout"],
    },
  ],
  "local-dev": [
    {
      id: "job-4",
      config_id: "local-dev",
      started_at: "2023-10-27T10:15:00Z",
      completed_at: null,
      status: "running",
      items_synced: 0,
      errors: [],
    },
  ],
};

interface PageProps {
  params: Promise<{ configId: string }>;
}

export default async function SyncConfigDetailPage({ params }: PageProps) {
  const { configId } = await params;
  const config = mockConfigs[configId];
  const jobs = mockJobs[configId] || [];

  if (!config) {
    return (
      <div className="space-y-8">
        <AdminHeader title="Sync Configuration Not Found" />
        <p>The requested configuration does not exist.</p>
        <Link href="/admin/sync" className="text-(--accent) hover:underline">
          ← Back to Sync Status
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <AdminHeader
          title={config.name}
          description={`Provider: ${config.provider} • Schedule: ${config.schedule || "Manual"}`}
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
            Total Jobs
          </h3>
          <p className="mt-2 text-lg font-medium text-foreground">
            {jobs.length}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Job History</h2>
        <SyncJobHistory jobs={jobs} />
      </div>
    </div>
  );
}
