"use client";

import Link from "next/link";

import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { CTA_LABELS } from "@/lib/design/cta";

export type MetricsSummaryRow = {
    metric: string;
    label: string;
    /** Already formatted current value, or "--" when there is none. */
    valueText: string;
    /** Already formatted delta; null = no prior period. */
    deltaText: string | null;
    href: string;
};

/**
 * The Summary table of a metrics tab on the shared DataTable: Metric, Current, Delta, Explore.
 * Rows come pre-formatted (serializable) from the server page; every cell is the row's link.
 */
export function MetricsSummaryTable({ rows }: { rows: MetricsSummaryRow[] }) {
    const columns: DataTableColumn<MetricsSummaryRow>[] = [
        {
            key: "metric",
            header: "Metric",
            render: (row) => (
                <Link href={row.href} className="block font-medium">
                    {row.label}
                </Link>
            ),
        },
        {
            key: "current",
            header: "Current",
            render: (row) => (
                <Link href={row.href} className="block text-(--ink-muted)">
                    {row.valueText}
                </Link>
            ),
        },
        {
            key: "delta",
            header: "Delta",
            render: (row) => (
                <Link href={row.href} className="block text-(--ink-muted)">
                    {row.deltaText === null ? (
                        <span title="No prior period available to compute a change">
                            No prior period
                        </span>
                    ) : (
                        row.deltaText
                    )}
                </Link>
            ),
        },
        {
            key: "explore",
            header: "Explore",
            render: (row) => (
                <Link
                    href={row.href}
                    className="block text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                >
                    {CTA_LABELS.openEvidence}
                </Link>
            ),
        },
    ];
    return (
        <DataTable
            accessibleLabel="Summary of the tab's metrics"
            columns={columns}
            data={rows}
            rowKeyAction={(row) => row.metric}
            emptyMessage="No metrics for this tab."
        />
    );
}
