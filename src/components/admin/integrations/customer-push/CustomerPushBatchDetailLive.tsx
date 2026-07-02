"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCustomerPushBatch } from "@/lib/admin/server";
import { CustomerPushStatusBadge } from "./CustomerPushStatusBadge";
import { RejectedRecordsTable } from "./RejectedRecordsTable";
import { TruncatedId } from "./TruncatedId";
import {
    classifyProducer,
    PRODUCER_BUCKET_LABELS,
    isTerminalCustomerPushStatus,
} from "@/lib/customer-push/producer";
import type { CustomerPushBatchDetail } from "@/lib/admin/types";

/** How often to refresh a non-terminal batch. Mirrors SyncRunDetailLive (D11). */
const POLL_INTERVAL_MS = 3500;
/** Safety cap so a stuck batch never polls forever (~10 min). */
const MAX_POLL_DURATION_MS = 10 * 60 * 1000;

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

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Monotonic sequence: invalidates any in-flight response that resolves
    // after a later terminal tick, the safety timeout, or unmount (mirrors
    // SyncRunDetailLive's FIX 3).
    const seqRef = useRef(0);
    const inFlightRef = useRef(false);

    const stopPolling = useCallback(() => {
        seqRef.current += 1;
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (testMode) return undefined;
        if (isTerminalCustomerPushStatus(initialBatch.status)) return undefined;

        let cancelled = false;

        const tick = async () => {
            if (inFlightRef.current) return;
            inFlightRef.current = true;
            const seq = (seqRef.current += 1);
            try {
                const result = await getCustomerPushBatch(ingestionId);
                if (cancelled || seq !== seqRef.current) return;

                if (result.error || !result.data) {
                    stopPolling();
                    setPollError(result.error ?? "Live updates are unavailable.");
                    return;
                }

                setBatch(result.data);
                setPollError(null);
                if (isTerminalCustomerPushStatus(result.data.status)) {
                    stopPolling();
                }
            } finally {
                inFlightRef.current = false;
            }
        };

        intervalRef.current = setInterval(() => void tick(), POLL_INTERVAL_MS);
        timeoutRef.current = setTimeout(() => stopPolling(), MAX_POLL_DURATION_MS);

        return () => {
            cancelled = true;
            stopPolling();
        };
    }, [testMode, ingestionId, initialBatch.status, stopPolling]);

    const isTerminal = isTerminalCustomerPushStatus(batch.status);
    const recordCountEntries = Object.entries(batch.record_counts ?? {});

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
                                      ? "Live updates paused"
                                      : "Live — refreshing…"}
                            </span>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
                            <div>
                                <dt className="text-xs text-(--ink-muted) uppercase tracking-wider">
                                    Producer
                                </dt>
                                <dd className="text-foreground">
                                    {PRODUCER_BUCKET_LABELS[classifyProducer(batch.producer ?? "")]}
                                    {batch.producer ? ` · ${batch.producer}` : ""}
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

            <div className="grid gap-6 md:grid-cols-3">
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

                <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <h3 className="text-sm font-medium text-(--ink-muted) uppercase tracking-wider">
                        Recompute status
                    </h3>
                    <p className="mt-3 text-sm text-foreground">
                        {batch.recompute_status ?? "Not available yet"}
                    </p>
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
                </h3>
                <RejectedRecordsTable records={batch.rejected_records} />
            </div>
        </div>
    );
}
