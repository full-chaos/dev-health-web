import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncConfigCard } from "@/components/admin/sync/SyncConfigCard";
import { SyncConfig } from "@/lib/sync-types";

// Mock data
const mockConfigs: SyncConfig[] = [
  {
    id: "gh-main",
    name: "GitHub Main Repo",
    provider: "github",
    last_sync_at: "2023-10-27T10:00:00Z",
    status: "success",
    schedule: "Every 1 hour",
  },
  {
    id: "jira-corp",
    name: "Corporate Jira",
    provider: "jira",
    last_sync_at: "2023-10-27T09:30:00Z",
    status: "failed",
    schedule: "Every 4 hours",
  },
  {
    id: "gl-legacy",
    name: "Legacy GitLab",
    provider: "gitlab",
    last_sync_at: null,
    status: "never",
    schedule: "Daily",
  },
  {
    id: "local-dev",
    name: "Local Development",
    provider: "local",
    last_sync_at: "2023-10-27T10:15:00Z",
    status: "running",
  },
];

export default function SyncStatusPage() {
  return (
    <div className="space-y-8">
      <AdminHeader
        title="Sync Status"
        description="Monitor and manage data synchronization jobs."
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {mockConfigs.map((config) => (
          <SyncConfigCard key={config.id} config={config} />
        ))}
      </div>
    </div>
  );
}
