import Link from "next/link";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { ProductTelemetryDashboard } from "@/components/product-telemetry/ProductTelemetryDashboard";
import { getProductTelemetryDashboardViaGraphQL } from "@/lib/graphql/productTelemetryFetchers";
import { resolveReaderWindow } from "@/lib/telemetry/readerWindow";

type SearchParams = { [key: string]: string | string[] | undefined };

const firstParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);
export default async function ProductTelemetryOrgDashboardPage({
    params,
    searchParams,
}: {
    params: Promise<{ orgId: string }>;
    searchParams?: Promise<SearchParams>;
}) {
    const { orgId } = await params;
    const rawParams = (await searchParams) ?? {};

    const { start, end } = resolveReaderWindow({
        startDate: firstParam(rawParams.startDate),
        endDate: firstParam(rawParams.endDate),
    });
    const dashboard = await getProductTelemetryDashboardViaGraphQL({
        orgId,
        startDate: start,
        endDate: end,
    });

    const backHref = `/superadmin/product-telemetry?startDate=${start}&endDate=${end}`;

    return (
        <div className="space-y-6">
            <Link
                href={backHref}
                className="inline-flex w-fit items-center rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em] text-(--ink-muted) transition-colors hover:border-(--ink-muted) hover:text-foreground"
            >
                ← Back to all orgs
            </Link>
            <AdminHeader
                title="Product telemetry"
                description="Drilldown view for a single organization, using persisted ClickHouse product telemetry for the selected date range."
            />
            <ProductTelemetryDashboard dashboard={dashboard} startDate={start} endDate={end} />
        </div>
    );
}
