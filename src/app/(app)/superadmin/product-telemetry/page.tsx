import { AdminHeader } from "@/components/admin/AdminHeader";
import { ProductTelemetryDashboard } from "@/components/product-telemetry/ProductTelemetryDashboard";
import { auth } from "@/lib/auth";
import { getProductTelemetryDashboardViaGraphQL } from "@/lib/graphql/productTelemetryFetchers";

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export default async function ProductTelemetryDashboardPage() {
  const session = await auth();
  const orgId = session?.user?.org_id;
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 30);

  if (!orgId) {
    return (
      <div className="space-y-6">
        <AdminHeader
          title="Product telemetry"
          description="First-party product usage analytics backed by ClickHouse."
        />
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 text-sm text-(--ink-muted)">
          Select an organization to view product telemetry.
        </div>
      </div>
    );
  }

  const start = isoDate(startDate);
  const end = isoDate(endDate);
  const dashboard = await getProductTelemetryDashboardViaGraphQL({ orgId, startDate: start, endDate: end });

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Product telemetry"
        description="First-party product usage analytics backed by persisted ClickHouse events."
      />
      <ProductTelemetryDashboard dashboard={dashboard} startDate={start} endDate={end} />
    </div>
  );
}
