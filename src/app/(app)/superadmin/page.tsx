import { AdminHeader } from "@/components/admin/AdminHeader";
import { getPlatformStats } from "@/lib/admin/server";

export default async function SuperadminDashboard() {
  const { data: stats, error } = await getPlatformStats();

  if (error) {
    return (
      <div>
        <AdminHeader
          title="Platform Dashboard"
          description="System overview and health metrics."
        />
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-800">
          <h3 className="text-lg font-semibold">Error loading stats</h3>
          <p className="mt-2 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null; // Should not happen if error is handled
  }

  return (
    <div className="space-y-8">
      <AdminHeader
        title="Platform Dashboard"
        description="System overview and health metrics."
      />

      {/* Key Metrics Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Organizations */}
        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
          <div className="text-sm font-medium text-(--ink-muted)">Total Organizations</div>
          <div className="mt-2 text-3xl font-bold text-foreground">
            {stats.total_organizations}
          </div>
          <div className="mt-1 text-xs text-(--ink-muted)">
            {stats.active_organizations} active
          </div>
        </div>

        {/* Users */}
        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
          <div className="text-sm font-medium text-(--ink-muted)">Total Users</div>
          <div className="mt-2 text-3xl font-bold text-foreground">
            {stats.total_users}
          </div>
          <div className="mt-1 text-xs text-(--ink-muted)">
            {stats.active_users} active
          </div>
        </div>

        {/* Superusers */}
        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
          <div className="text-sm font-medium text-(--ink-muted)">Superusers</div>
          <div className="mt-2 text-3xl font-bold text-purple-500">
            {stats.superuser_count}
          </div>
          <div className="mt-1 text-xs text-(--ink-muted)">
            System administrators
          </div>
        </div>

        {/* Memberships */}
        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
          <div className="text-sm font-medium text-(--ink-muted)">Total Memberships</div>
          <div className="mt-2 text-3xl font-bold text-foreground">
            {stats.total_memberships}
          </div>
          <div className="mt-1 text-xs text-(--ink-muted)">
            Across all organizations
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tier Distribution */}
        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">Tier Distribution</h3>
          <div className="space-y-4">
            {Object.entries(stats.tier_distribution).map(([tier, count]) => (
              <div key={tier} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-purple-500" />
                  <span className="text-sm font-medium capitalize text-foreground">
                    {tier}
                  </span>
                </div>
                <span className="text-sm text-(--ink-muted)">{count} orgs</span>
              </div>
            ))}
            {Object.keys(stats.tier_distribution).length === 0 && (
              <div className="text-sm text-(--ink-muted)">No organizations found</div>
            )}
          </div>
        </div>

        {/* Sync Health */}
        <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
          <h3 className="mb-4 text-lg font-semibold text-foreground">Sync Health</h3>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-(--bg-base) p-4">
              <div className="text-xs font-medium text-(--ink-muted)">Sync Configs</div>
              <div className="mt-1 text-2xl font-bold text-foreground">
                {stats.active_sync_configs}
                <span className="ml-1 text-sm font-normal text-(--ink-muted)">
                  / {stats.total_sync_configs} active
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-(--bg-base) p-4">
              <div className="text-xs font-medium text-(--ink-muted)">Last 24h Syncs</div>
              <div className="mt-1 flex items-baseline gap-3">
                <div className="text-2xl font-bold text-green-600">
                  {stats.recent_syncs_success}
                  <span className="ml-1 text-xs font-normal text-(--ink-muted)">success</span>
                </div>
                <div className="text-2xl font-bold text-red-600">
                  {stats.recent_syncs_failed}
                  <span className="ml-1 text-xs font-normal text-(--ink-muted)">failed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
