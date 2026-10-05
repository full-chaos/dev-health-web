"use client";

import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { formatPercent } from "@/lib/formatters";
import {
    baselineOf,
    baselineText,
    baselineTitle,
    type CoverageBaselinesState,
} from "@/lib/testops/coverageBaselines";
import type { RepositoryCoverageRow } from "@/lib/testops/coverageRepos";

type RepositoryCoverageTableProps = {
    rows: RepositoryCoverageRow[];
    /** The served baseline of each repository, or the fact that its read failed. */
    baselines: CoverageBaselinesState;
};

/**
 * The approved "Repository coverage" table: Repository, Line coverage, Baseline. Rows are the
 * served line-coverage breakdown by repository. The Baseline column is the served line baseline of
 * the repository (its own 30-day average), joined by the repository id: "Not reported" when the
 * value is null or the repository has no baseline row, "Could not be read" when the read failed.
 */
export function RepositoryCoverageTable({ rows, baselines }: RepositoryCoverageTableProps) {
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
            // A line coverage that is not served is "Not reported", never 0%.
            render: (row) =>
                row.lineCoverage === null ? NOT_REPORTED : formatPercent(row.lineCoverage),
        },
        {
            key: "baseline",
            header: "Baseline",
            numeric: true,
            render: (row) => {
                const cell = baselineOf(baselines, row.id, "line");
                return <span title={baselineTitle(cell)}>{baselineText(cell)}</span>;
            },
        },
    ];
    return (
        <DataTable
            accessibleLabel="Repository coverage"
            columns={columns}
            data={rows}
            rowKeyAction={(row) => row.id}
            emptyMessage="No repository coverage for this window or scope."
            footerNote="The baseline of a repository is its own average line coverage over the 30 days that end on the last day of the window. A repository with fewer than 7 days of coverage in those 30 days has no baseline."
            testId="testops-repository-coverage-table"
            rowTestId="testops-repository-coverage-row"
        />
    );
}
