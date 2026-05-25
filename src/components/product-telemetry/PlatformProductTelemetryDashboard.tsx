import Link from "next/link";

import { ProductTelemetryDashboard } from "@/components/product-telemetry/ProductTelemetryDashboard";
import type { ProductTelemetryPlatformDashboardData } from "@/lib/graphql/productTelemetryFetchers";

type PlatformProductTelemetryDashboardProps = {
  dashboard: ProductTelemetryPlatformDashboardData;
  startDate: string;
  endDate: string;
};

const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? "--" : new Intl.NumberFormat("en-US").format(value);

function StatCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">{label}</p>
      <p className="mt-3 font-(--font-display) text-3xl font-semibold text-foreground">
        {value}
      </p>
      <p className="mt-2 text-xs text-(--ink-muted)">{caption}</p>
    </div>
  );
}

function TopOrgsTable({
  rows,
  startDate,
  endDate,
}: {
  rows: ProductTelemetryPlatformDashboardData["topOrgs"];
  startDate: string;
  endDate: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-4 py-8 text-center text-sm text-(--ink-muted)">
        No orgs reported product telemetry in this window.
      </div>
    );
  }

  // Drilldown only when the hash resolves to a known Postgres org. Unknown
  // hashes are listed but cannot be drilled into without a real id.
  const drilldownHref = (org: ProductTelemetryPlatformDashboardData["topOrgs"][number]) =>
    org.orgId
      ? `/superadmin/product-telemetry/${org.orgId}?startDate=${startDate}&endDate=${endDate}`
      : null;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.16em] text-(--ink-muted)">
          <tr className="border-b border-(--card-stroke)">
            <th className="py-2 pr-4 font-medium">Organization</th>
            <th className="py-2 pr-4 font-medium">Events</th>
            <th className="py-2 pr-4 font-medium">Sessions</th>
            <th className="py-2 pr-4 font-medium">Anonymous users</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--card-stroke)">
          {rows.map((org) => {
            const label =
              org.orgName ||
              org.orgSlug ||
              `${org.orgIdHash.slice(0, 12)}\u2026`;
            const href = drilldownHref(org);
            return (
              <tr key={org.orgIdHash}>
                <td className="py-3 pr-4">
                  {href ? (
                    <Link
                      href={href}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {label}
                    </Link>
                  ) : (
                    <span
                      className="font-medium text-(--ink-muted)"
                      title="No matching organization in Postgres — drilldown unavailable."
                    >
                      {label}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-(--ink-muted)">{formatNumber(org.events)}</td>
                <td className="py-3 pr-4 text-(--ink-muted)">{formatNumber(org.sessions)}</td>
                <td className="py-3 pr-4 text-(--ink-muted)">
                  {formatNumber(org.anonymousUsers)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PlatformProductTelemetryDashboard({
  dashboard,
  startDate,
  endDate,
}: PlatformProductTelemetryDashboardProps) {
  const totals = dashboard.totals;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active orgs"
          value={formatNumber(totals.activeOrgs)}
          caption="Distinct tenants with events in window"
        />
        <StatCard
          label="Anonymous users"
          value={formatNumber(totals.anonymousUsers)}
          caption="Distinct anon users across all orgs"
        />
        <StatCard
          label="Sessions"
          value={formatNumber(totals.sessions)}
          caption="Distinct sessions across all orgs"
        />
        <StatCard
          label="Events"
          value={formatNumber(totals.events)}
          caption="Total raw events in window"
        />
      </div>

      <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5 shadow-[0_24px_80px_-56px_rgba(0,0,0,0.55)]">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Top organizations</h2>
            <p className="mt-1 text-sm text-(--ink-muted)">
              Tenants ranked by event volume. Click an org to drill down into its
              per-org product telemetry.
            </p>
          </div>
        </div>
        <TopOrgsTable rows={dashboard.topOrgs} startDate={startDate} endDate={endDate} />
      </section>

      <ProductTelemetryDashboard
        dashboard={dashboard}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
}
