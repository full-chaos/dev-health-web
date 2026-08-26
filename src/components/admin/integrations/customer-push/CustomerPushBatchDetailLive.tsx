"use client";

import { useCallback, useRef, useState } from "react";
import { getCustomerPushBatch } from "@/lib/admin/server";
import { CustomerPushStatusBadge } from "./CustomerPushStatusBadge";
import { RejectedRecordsTable } from "./RejectedRecordsTable";
import { TruncatedId } from "./TruncatedId";
import { RefreshControl } from "@/components/admin/RefreshControl";
import {
    classifyProducer,
    PRODUCER_BUCKET_LABELS,
    isTerminalCustomerPushStatus,
} from "@/lib/customer-push/producer";
import type { CustomerPushBatchDetail } from "@/lib/admin/types";

interface CustomerPushBatchDetailLiveProps {
    initialBatch: CustomerPushBatchDetail;
    /** When true, render the provided sample data and never poll a live API. */
    testMode?: boolean;
}

function formatTimestamp(value: string | null) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
}

export function CustomerPushBatchDetailLive({
    initialBatch,
    testMode = false,
}: CustomerPushBatchDetailLiveProps) {
    const ingestionId = initialBatch.ingestion_id;
    const [batch, setBatch] = useState<CustomerPushBatchDetail>(initialBatch);
    const [pollError, setPollError] = useState<string | null>(null);
    // CHAOS-4318: no more timer-driven polling against the Python API — the
    // initial (server) fetch populates this on mount, and every subsequent
    // read comes from an explicit Refresh click.
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(
        testMode ? null : new Date().toISOString(),
    );
    const [isRefreshing, setIsRefreshing] = useState(false);
    const inFlightRef = useRef(false);

    // CHAOS-4318: manual refresh only — fetch the batch on demand via the
    // Refresh control instead of a setInterval poll loop.
    const refresh = useCallback(async () => {
        if (inFlightRef.current || testMode) return;
        inFlightRef.current = true;
        setIsRefreshing(true);
        try {
            const result = await getCustomerPushBatch(ingestionId);
            if (result.error || !result.data) {
                setPollError(result.error ?? "Refresh failed.");
                return;
            }
            setBatch(result.data);
            setPollError(null);
            setLastUpdatedAt(new Date().toISOString());
        } finally {
            inFlightRef.current = false;
            setIsRefreshing(false);
        }
    }, [testMode, ingestionId]);

    const isTerminal = isTerminalCustomerPushStatus(batch.status);
    const recordCountEntries = Object.entries(batch.record_counts ?? {});
    const rejectedTruncated = batch.rejected_records_total > batch.rejected_records.length;

    return (
        <div className="space-y-6">
            <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <CustomerPushStatusBadge
                                status={batch.status}
                                className="text-sm px-3 py-1"
                            />
                            <span className="text-sm text-(--ink-muted)">
                                {isTerminal
                                    ? "Batch complete"
                                    : pollError
                                      ? "Live updates unavailable"
                                      : "Not auto-refreshing — use Refresh for the latest state"}
                            </span>
                        </div>
                        {!isTerminal && !testMode && (
                            <RefreshControl
                                onRefresh={refresh}
                                lastUpdatedAt={lastUpdatedAt}
                                isRefreshing={isRefreshing}
                            />
                        )}
                        <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
                            <div>
                                <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                    Producer
                                </dt>
                                <dd className="text-foreground">
                                    {PRODUCER_BUCKET_LABELS[classifyProducer(batch.producer)]} ·{" "}
                                    {batch.producer ?? "—"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                    Schema
                                </dt>
                                <dd className="text-foreground">{batch.schema_version}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                    Attempts
                                </dt>
                                <dd className="text-foreground">{batch.attempts}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                    Created
                                </dt>
                                <dd className="text-foreground">
                                    {formatTimestamp(batch.created_at)}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                    Completed
                                </dt>
                                <dd className="text-foreground">
                                    {formatTimestamp(batch.completed_at)}
                                </dd>
                            </div>
                        </dl>
                        <TruncatedId value={batch.ingestion_id} label="Ingestion ID" />
                    </div>
                </div>
            </div>

            {pollError && (
                <div
                    role="alert"
                    className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6"
                >
                    <h3 className="text-sm font-medium text-red-500 uppercase tracking-wider">
                        Live updates unavailable
                    </h3>
                    <p className="mt-2 text-sm text-(--ink-muted)">{pollError}</p>
                </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                        Items
                    </h3>
                    <dl className="mt-3 space-y-1.5 text-sm">
                        <div className="flex items-center justify-between">
                            <dt className="text-foreground">Received</dt>
                            <dd className="font-medium text-(--ink-muted)">
                                {batch.items_received}
                            </dd>
                        </div>
                        <div className="flex items-center justify-between">
                            <dt className="text-foreground">Accepted</dt>
                            <dd className="font-medium text-(--ink-muted)">
                                {batch.items_accepted}
                            </dd>
                        </div>
                        <div className="flex items-center justify-between">
                            <dt className="text-foreground">Rejected</dt>
                            <dd className="font-medium text-(--ink-muted)">
                                {batch.items_rejected}
                            </dd>
                        </div>
                    </dl>
                </div>

                <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                        Record counts
                    </h3>
                    {recordCountEntries.length === 0 ? (
                        <p className="mt-3 text-sm text-(--ink-muted)">No data yet.</p>
                    ) : (
                        <ul className="mt-3 space-y-1.5">
                            {recordCountEntries.map(([kind, count]) => (
                                <li
                                    key={kind}
                                    className="flex items-center justify-between text-sm"
                                >
                                    <span className="text-foreground">{kind}</span>
                                    <span className="font-medium text-(--ink-muted)">{count}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {batch.error_summary && (
                <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                        Error summary
                    </h3>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                        <div>
                            <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                Total rejected
                            </dt>
                            <dd className="text-foreground">
                                {batch.error_summary.total_rejected}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                Stored
                            </dt>
                            <dd className="text-foreground">
                                {batch.error_summary.stored_rejections}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                Truncated
                            </dt>
                            <dd className="text-foreground">
                                {batch.error_summary.truncated ? "Yes" : "No"}
                            </dd>
                        </div>
                    </dl>
                    {batch.error_summary.top_codes.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {batch.error_summary.top_codes.map(({ code, count }) => (
                                <span
                                    key={code}
                                    className="rounded-full bg-(--card-70) px-2 py-0.5 text-xs font-mono text-(--ink-muted)"
                                >
                                    {code}: {count}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-3">
                <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                    Rejected records
                    {rejectedTruncated && (
                        <span className="ml-2 normal-case text-(--ink-muted)">
                            (showing {batch.rejected_records.length} of{" "}
                            {batch.rejected_records_total})
                        </span>
                    )}
                </h3>
                <RejectedRecordsTable records={batch.rejected_records} />
            </div>
        </div>
    );
}
