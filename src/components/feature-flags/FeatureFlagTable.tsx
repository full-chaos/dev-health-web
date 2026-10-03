"use client";

import { useCallback, useState, useTransition } from "react";

import { DataTable } from "@/components/shared/DataTable";
import type { DataTableColumn } from "@/components/shared/DataTable";
import { STATUS_PILL } from "@/lib/statusPill";
import type { FeatureFlagListItem, FeatureFlagListResult } from "@/lib/feature-flags/types";

const PAGE_SIZE = 20;

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    on: { label: "ON", className: STATUS_PILL.positive },
    off: { label: "OFF", className: STATUS_PILL.negative },
    // Unknown is its own state with its own label: never the OFF pill.
    unknown: { label: "Unknown", className: STATUS_PILL.muted },
};

/** A date the provider did not record reads "Not recorded" (MAPPING F6), never "--" or a made-up date. */
const NOT_RECORDED = "Not recorded";

function formatDate(iso: string | null): string {
    if (!iso) return NOT_RECORDED;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return NOT_RECORDED;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const columns: DataTableColumn<FeatureFlagListItem>[] = [
    {
        key: "flagKey",
        header: "Flag Key",
        render: (row) => <span className="font-mono text-xs">{row.flagKey}</span>,
    },
    {
        key: "provider",
        header: "Provider",
        render: (row) => (
            <span className="text-xs capitalize text-(--ink-muted)">{row.provider}</span>
        ),
    },
    {
        key: "createdAt",
        header: "Created",
        render: (row) => (
            <span className="text-xs text-(--ink-muted)">{formatDate(row.createdAt)}</span>
        ),
    },
    {
        key: "lastToggled",
        header: "Last Toggled",
        render: (row) => (
            <span className="text-xs text-(--ink-muted)">{formatDate(row.lastToggledAt)}</span>
        ),
    },
    {
        key: "status",
        header: "Status",
        render: (row) => {
            const key = row.isActive === true ? "on" : row.isActive === false ? "off" : "unknown";
            const badge = STATUS_BADGE[key];
            return (
                <span
                    data-testid="flag-status"
                    data-status={key}
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.className}`}
                >
                    {badge.label}
                </span>
            );
        },
    },
];

type Props = {
    initialData: FeatureFlagListResult;
    fetchAction: (offset: number, limit: number) => Promise<FeatureFlagListResult>;
};

export function FeatureFlagTable({ initialData, fetchAction }: Props) {
    const [data, setData] = useState(initialData);
    const [offset, setOffset] = useState(0);
    const [isPending, startTransition] = useTransition();

    const handlePageChange = useCallback(
        (newOffset: number) => {
            startTransition(async () => {
                const result = await fetchAction(newOffset, PAGE_SIZE);
                setData(result);
                setOffset(newOffset);
            });
        },
        [fetchAction],
    );

    return (
        <DataTable<FeatureFlagListItem>
            accessibleLabel="Feature flags"
            columns={columns}
            data={data.items}
            rowKeyAction={(row) => row.flagId}
            emptyMessage="No feature flags found"
            summaryLabel="flags"
            pagination={{
                limit: PAGE_SIZE,
                offset,
                total: data.totalCount,
            }}
            onPageChangeAction={handlePageChange}
            isPending={isPending}
        />
    );
}
