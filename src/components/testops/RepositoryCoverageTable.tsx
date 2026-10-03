"use client";

import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { formatPercent } from "@/lib/formatters";
import type { RepositoryCoverageRow } from "@/lib/testops/coverageRepos";

type RepositoryCoverageTableProps = {
    rows: RepositoryCoverageRow[];
    /** The one product target baseline (percent); a per-repository baseline is not served. */
    baselinePct: number;
};

/**
 * The approved "Repository coverage" table: Repository, Line coverage, Baseline. Rows are the
 * served line-coverage breakdown by repository. The Baseline column repeats the one product target
 * (the API serves no per-repository baseline yet), and the footer says so.
 */
export function RepositoryCoverageTable({ rows, baselinePct }: RepositoryCoverageTableProps) {
    const columns: DataTableColumn<RepositoryCoverageRow>[] = [
        {
            key: "repository",
            header: "Repository",
            render: (row) => <span title={row.title}>{row.name}</span>,
        },
        {
            key: "line",
            header: "Line coverage",
            numeric: true,
            render: (row) => formatPercent(row.lineCoverage),
        },
        {
            key: "baseline",
            header: "Baseline",
            numeric: true,
            render: () => formatPercent(baselinePct),
        },
    ];
    return (
        <DataTable
            accessibleLabel="Repository coverage"
            columns={columns}
            data={rows}
            rowKeyAction={(row) => row.id}
            emptyMessage="No repository coverage for this window or scope."
            footerNote="One target baseline applies to every repository; a per-repository baseline is not reported yet."
            testId="testops-repository-coverage-table"
            rowTestId="testops-repository-coverage-row"
        />
    );
}
