import { PROVIDER_LABELS, type SyncConfig } from "@/lib/admin/types";
import type { SyncStatus } from "@/lib/sync-types";

export type SyncConfigRowKind = "group" | "child" | "standalone";

export type SyncConfigTableRow = {
    readonly config: SyncConfig;
    readonly kind: SyncConfigRowKind;
    readonly childConfigs: readonly SyncConfig[];
    readonly parentName?: string;
};

export function persistedStatus(config: SyncConfig): SyncStatus {
    if (!config.last_sync_at) return "never";
    return config.last_sync_success ? "success" : "failed";
}

export function groupStatus(childConfigs: readonly SyncConfig[]): SyncStatus {
    if (childConfigs.some((config) => config.last_sync_success === false)) return "failed";
    if (childConfigs.some((config) => config.last_sync_success === true)) return "success";
    return "never";
}

export function latestSyncAt(configs: readonly SyncConfig[]): string | null {
    return configs.reduce<string | null>((latest, config) => {
        if (!config.last_sync_at) return latest;
        if (!latest || config.last_sync_at > latest) return config.last_sync_at;
        return latest;
    }, null);
}

export function providerLabel(provider: string): string {
    return Object.entries(PROVIDER_LABELS).find(([key]) => key === provider)?.[1] ?? provider;
}

export function buildSyncConfigTableRows(
    configs: readonly SyncConfig[],
    expandedGroupIds: ReadonlySet<string>,
): SyncConfigTableRow[] {
    const childrenByParent = new Map<string, SyncConfig[]>();
    for (const config of configs) {
        if (!config.parent_id) continue;
        const siblings = childrenByParent.get(config.parent_id) ?? [];
        siblings.push(config);
        childrenByParent.set(config.parent_id, siblings);
    }

    const rows: SyncConfigTableRow[] = [];
    for (const config of configs) {
        if (config.parent_id) continue;
        const childConfigs = childrenByParent.get(config.id) ?? [];
        if (childConfigs.length === 0) {
            rows.push({ config, kind: "standalone", childConfigs: [] });
            continue;
        }

        rows.push({ config, kind: "group", childConfigs });
        if (!expandedGroupIds.has(config.id)) continue;
        for (const child of childConfigs) {
            rows.push({
                config: child,
                kind: "child",
                childConfigs: [],
                parentName: config.name,
            });
        }
    }
    return rows;
}
