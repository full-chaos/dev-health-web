import { AdminHeader } from "@/components/admin/AdminHeader";
import { PlatformProductTelemetryDashboard } from "@/components/product-telemetry/PlatformProductTelemetryDashboard";
import { getProductTelemetryPlatformDashboardViaGraphQL } from "@/lib/graphql/productTelemetryFetchers";
import { resolveReaderWindow } from "@/lib/telemetry/readerWindow";

type SearchParams = { startDate?: string; endDate?: string };

export default async function ProductTelemetryDashboardPage({
    searchParams,
}: {
    searchParams?: Promise<SearchParams>;
}) {
    const params = (await searchParams) ?? {};
    const { start, end } = resolveReaderWindow(params);
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
