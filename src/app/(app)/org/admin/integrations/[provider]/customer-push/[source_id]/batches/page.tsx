import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { BackLink } from "@/components/shared/BackLink";
import { CustomerPushBatchList } from "@/components/admin/integrations/customer-push/CustomerPushBatchList";
import { getCustomerPushSource, listCustomerPushBatches } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import type { CustomerPushBatchStatus } from "@/lib/admin/types";

const STATUSES: CustomerPushBatchStatus[] = [
    "accepted",
    "stream_unavailable",
    "processing",
    "completed",
    "partial",
    "failed",
];

export default async function CustomerPushBatchesPage({
    params,
    searchParams,
}: {
    params: Promise<{ provider: string; source_id: string }>;
    searchParams: Promise<{ status?: string; from?: string; to?: string }>;
}) {
    const { provider, source_id: sourceId } = await params;
    const filters = await searchParams;

    const status =
        filters.status && (STATUSES as string[]).includes(filters.status)
            ? (filters.status as CustomerPushBatchStatus)
            : undefined;

    const [sourceResult, batchesResult] = await Promise.all([
        getCustomerPushSource(sourceId),
        listCustomerPushBatches(sourceId, {
            status,
            from: filters.from || undefined,
            to: filters.to || undefined,
            limit: 50,
        }),
    ]);

    if (sourceResult.error || !sourceResult.data) {
        notFound();
    }

    const basePath = `/org/admin/integrations/${provider}/customer-push/${sourceId}`;
    const displayName = sourceResult.data.display_name || sourceResult.data.instance;
    // Batch list is a paginated envelope {items,total,limit,offset}, not a
    // bare array (verified: AdminBatchListResponse).
    const batches = batchesResult.data?.items ?? [];

    return (
        <div className="space-y-6">
            <BackLink href={basePath} area={displayName} />

            <AdminHeader title="Ingest status" description={`Batches pushed for ${displayName}.`} />

            {batchesResult.error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500">
                    Failed to load batches: {batchesResult.error}
                </div>
            )}

            <form method="GET" className="flex flex-wrap items-end gap-3">
                <div>
                    <label
                        htmlFor="batch-status-filter"
                        className="mb-1.5 block text-xs font-medium text-(--ink-muted) uppercase tracking-wider"
                    >
                        Status
                    </label>
                    <select
                        id="batch-status-filter"
                        name="status"
                        defaultValue={status ?? ""}
                        className="rounded-md border border-(--border-subtle) bg-(--surface-base) px-3 py-2 text-sm text-(--ink-base)"
                    >
                        <option value="">All statuses</option>
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label
                        htmlFor="batch-from-filter"
                        className="mb-1.5 block text-xs font-medium text-(--ink-muted) uppercase tracking-wider"
                    >
                        From
                    </label>
                    <input
                        id="batch-from-filter"
                        type="date"
                        name="from"
                        defaultValue={filters.from ?? ""}
                        className="rounded-md border border-(--border-subtle) bg-(--surface-base) px-3 py-2 text-sm text-(--ink-base)"
                    />
                </div>
                <div>
                    <label
                        htmlFor="batch-to-filter"
                        className="mb-1.5 block text-xs font-medium text-(--ink-muted) uppercase tracking-wider"
                    >
                        To
                    </label>
                    <input
                        id="batch-to-filter"
                        type="date"
                        name="to"
                        defaultValue={filters.to ?? ""}
                        className="rounded-md border border-(--border-subtle) bg-(--surface-base) px-3 py-2 text-sm text-(--ink-base)"
                    />
                </div>
                <button
                    type="submit"
                    className="rounded-md border border-(--border-subtle) bg-(--surface-base) px-4 py-2 text-sm font-medium text-(--ink-base) hover:bg-(--surface-muted)"
                >
                    {CTA_LABELS.applyFilters}
                </button>
            </form>

            <CustomerPushBatchList
                provider={provider}
                sourceId={sourceId}
                batches={batches}
                validateHref={`${basePath}/validate`}
                examplesHref={`${basePath}/examples`}
            />
        </div>
    );
}
