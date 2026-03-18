import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SyncConfigCard } from "@/components/admin/sync/SyncConfigCard";
import { SyncConfigGroup } from "@/components/admin/sync/SyncConfigGroup";
import { listSyncConfigs } from "@/lib/admin/server";
import type { SyncConfig } from "@/lib/admin/types";

export default async function SyncStatusPage() {
  const result = await listSyncConfigs();
  const configs = result.data ?? [];

  // Separate parents (configs with children) from children and standalones.
  const childrenByParent = new Map<string, SyncConfig[]>();
  const childIds = new Set<string>();

  for (const config of configs) {
    if (config.parent_id) {
      childIds.add(config.id);
      const siblings = childrenByParent.get(config.parent_id) ?? [];
      siblings.push(config);
      childrenByParent.set(config.parent_id, siblings);
    }
  }

  // Configs that are parents of at least one child
  const parentIds = new Set(childrenByParent.keys());

  // Standalones: not a child AND not a parent
  const standalones = configs.filter((c) => !childIds.has(c.id) && !parentIds.has(c.id));

  // Actual parent configs (ordered by original list)
  const parents = configs.filter((c) => parentIds.has(c.id));

  return (
    <div className="space-y-8">
      <AdminHeader
        title="Sync Status"
        description="Monitor and manage data synchronization jobs."
      >
        <Link
          href="/admin/sync/new"
          className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:opacity-80 active:opacity-70 transition-opacity"
        >
          New Config
        </Link>
      </AdminHeader>

      {result.error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
          Failed to load sync configs: {result.error}
        </div>
      )}

      {configs.length === 0 && !result.error && (
        <div className="rounded-lg border border-(--card-stroke) bg-(--card-80) p-8 text-center text-(--ink-muted)">
          No sync configurations found. Create a new configuration to get started.
        </div>
      )}

      {/* Grouped parent configs */}
      {parents.length > 0 && (
        <div className="space-y-4">
          {parents.map((parent) => (
            <SyncConfigGroup
              key={parent.id}
              parent={parent}
              childConfigs={childrenByParent.get(parent.id) ?? []}
            />
          ))}
        </div>
      )}

      {/* Standalone configs (no parent, no children) */}
      {standalones.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {standalones.map((config) => (
            <SyncConfigCard key={config.id} config={config} />
          ))}
        </div>
      )}
    </div>
  );
}
