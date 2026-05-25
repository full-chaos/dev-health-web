import { AdminHeader } from "@/components/admin/AdminHeader";
import { PlatformProductTelemetryDashboard } from "@/components/product-telemetry/PlatformProductTelemetryDashboard";
import { getProductTelemetryPlatformDashboardViaGraphQL } from "@/lib/graphql/productTelemetryFetchers";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

type SearchParams = { startDate?: string; endDate?: string };

export default async function ProductTelemetryDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const endDate = params.endDate ? new Date(params.endDate) : new Date();
  const startDate = params.startDate
    ? new Date(params.startDate)
    : (() => {
        const d = new Date(endDate);
        d.setUTCDate(d.getUTCDate() - 30);
        return d;
      })();

  const start = isoDate(startDate);
  const end = isoDate(endDate);
  const dashboard = await getProductTelemetryPlatformDashboardViaGraphQL({
    startDate: start,
    endDate: end,
  });

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Product telemetry"
        description="Cross-org first-party product usage analytics backed by persisted ClickHouse events. Click any organization to drill down."
      />
      <PlatformProductTelemetryDashboard
        dashboard={dashboard}
        startDate={start}
        endDate={end}
      />
    </div>
  );
}
