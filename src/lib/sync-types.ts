export type SyncStatus = "idle" | "running" | "failed" | "success" | "never";

export type SyncConfig = {
  id: string;
  name: string;
  provider: "github" | "gitlab" | "jira" | "local";
  last_sync_at: string | null;
  status: SyncStatus;
  schedule?: string;
};

export type SyncJob = {
  id: string;
  config_id: string;
  started_at: string;
  completed_at: string | null;
  status: SyncStatus;
  items_synced: number;
  errors: string[];
};
