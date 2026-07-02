"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CustomerPushStatusBadge } from "./CustomerPushStatusBadge";
import { TruncatedId } from "./TruncatedId";
import { CTA_LABELS } from "@/lib/design/cta";
import {
    classifyProducer,
    PRODUCER_BUCKET_LABELS,
    type ProducerBucket,
} from "@/lib/customer-push/producer";
import type { CustomerPushBatchSummary } from "@/lib/admin/types";

type CustomerPushBatchListProps = {
    provider: string;
    sourceId: string;
    batches: CustomerPushBatchSummary[];
    validateHref: string;
    examplesHref: string;
};

const BUCKETS: ProducerBucket[] = ["cli", "ci", "relay", "api"];

function formatTimestamp(value: string | null) {
    if (!value) return "—";
    return new Date(value).toLocaleString();
}

export function CustomerPushBatchList({
    provider,
    sourceId,
    batches,
    validateHref,
    examplesHref,
}: CustomerPushBatchListProps) {
    const [activeBucket, setActiveBucket] = useState<ProducerBucket | null>(null);

    const visibleBatches = useMemo(() => {
        if (!activeBucket) return batches;
        return batches.filter((batch) => classifyProducer(batch.producer) === activeBucket);
    }, [batches, activeBucket]);

    if (batches.length === 0) {
        return (
            <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-8 text-center">
                <p className="text-sm text-(--ink-muted)">
                    No batches yet — push your first payload from{" "}
                    <Link href={validateHref} className="text-(--accent) hover:underline">
                        {CTA_LABELS.goToValidate}
                    </Link>{" "}
                    or a{" "}
                    <Link href={examplesHref} className="text-(--accent) hover:underline">
                        {CTA_LABELS.goToCiJob}
                    </Link>
                    .
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => setActiveBucket(null)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        activeBucket === null
                            ? "border-(--accent) text-foreground"
                            : "border-(--border-subtle) text-(--ink-muted) hover:text-foreground"
                    }`}
                >
                    {CTA_LABELS.allProducers}
                </button>
                {BUCKETS.map((bucket) => (
                    <button
                        key={bucket}
                        type="button"
                        onClick={() => setActiveBucket(bucket)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${
                            activeBucket === bucket
                                ? "border-(--accent) text-foreground"
                                : "border-(--border-subtle) text-(--ink-muted) hover:text-foreground"
                        }`}
                    >
                        {PRODUCER_BUCKET_LABELS[bucket]}
                    </button>
                ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-(--card-stroke) bg-(--card-80)">
                <table className="min-w-full divide-y divide-(--card-stroke)">
                    <thead className="bg-(--card-bg)">
                        <tr>
                            {[
                                "Batch",
                                "Producer",
                                "Status",
                                "Received",
                                "Accepted",
                                "Rejected",
                                "Created",
                                "Completed",
                            ].map((heading) => (
                                <th
                                    key={heading}
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-(--ink-muted) uppercase tracking-wider"
                                >
                                    {heading}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-(--card-stroke)">
                        {visibleBatches.map((batch) => (
                            <tr key={batch.ingestion_id} className="hover:bg-(--card-70)">
                                <td className="px-4 py-3">
                                    <Link
                                        href={`/org/admin/integrations/${provider}/customer-push/${sourceId}/batches/${batch.ingestion_id}`}
                                        className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                                    >
                                        <TruncatedId
                                            value={batch.ingestion_id}
                                            label="Ingestion ID"
                                            readOnly
                                        />
                                    </Link>
                                </td>
                                <td className="px-4 py-3 text-sm text-(--ink-muted)">
                                    {PRODUCER_BUCKET_LABELS[classifyProducer(batch.producer)]} ·{" "}
                                    {batch.producer ?? "—"}
                                </td>
                                <td className="px-4 py-3">
                                    <CustomerPushStatusBadge status={batch.status} />
                                </td>
                                <td className="px-4 py-3 text-sm text-(--ink-muted)">
                                    {batch.items_received}
                                </td>
                                <td className="px-4 py-3 text-sm text-(--ink-muted)">
                                    {batch.items_accepted}
                                </td>
                                <td className="px-4 py-3 text-sm text-(--ink-muted)">
                                    {batch.items_rejected}
                                </td>
                                <td className="px-4 py-3 text-sm text-(--ink-muted)">
                                    {formatTimestamp(batch.created_at)}
                                </td>
                                <td className="px-4 py-3 text-sm text-(--ink-muted)">
                                    {formatTimestamp(batch.completed_at)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
