import type { SyncConfig as ApiSyncConfig } from "@/lib/admin/types";

export type SyncStatus = "idle" | "running" | "failed" | "success" | "never";

export type SyncConfig = {
    id: string;
    name: string;
    provider: string;
    last_sync_at: string | null;
    status: SyncStatus;
    schedule?: string;
};

export function toSyncConfig(apiConfig: ApiSyncConfig): SyncConfig {
    let status: SyncStatus = "never";
    if (apiConfig.last_sync_at) {
        status = apiConfig.last_sync_success ? "success" : "failed";
    }
    return {
        id: apiConfig.id,
        name: apiConfig.name,
        provider: apiConfig.provider,
        last_sync_at: apiConfig.last_sync_at,
        status,
    };
}

export type SyncJob = {
    id: string;
    config_id: string;
    started_at: string;
    completed_at: string | null;
    status: SyncStatus;
    items_synced: number;
    errors: string[];
};
