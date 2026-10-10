"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/reports/StatusBadge";
import { formatDateUTC } from "@/lib/formatters";
import type { SavedReport } from "@/lib/reports/types";

/** Internal report path built from the id alone; a served value never decides where the link goes. */
export function reportHref(id: string): string {
    return `/reports/${encodeURIComponent(id)}`;
}

// Saved reports as a table (design R3 / R-2): name + description, schedule, last run, status and an
// open arrow. Every cell is a served field of the report; nothing is computed here.
const COLUMNS: readonly DataTableColumn<SavedReport>[] = [
    {
        key: "name",
        header: "Report",
        className: "px-3 py-3.25 align-top",
        render: (report) => (
            <>
                <Link
                    href={reportHref(report.id)}
                    prefetch={false}
                    className="font-semibold text-(--accent-2) hover:underline"
                >
                    {report.name}
                </Link>
                {report.description ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-(--ink-muted)">
                        {report.description}
                    </p>
                ) : null}
            </>
        ),
    },
    {
        key: "schedule",
        header: "Schedule",
        render: (report) => (report.scheduleId ? "Scheduled" : "Manual"),
    },
    {
        key: "lastRun",
        header: "Last run",
        render: (report) =>
            report.lastRunAt ? (
                formatDateUTC(report.lastRunAt)
            ) : (
                <span className="text-(--ink-muted)">Never</span>
            ),
    },
    {
        key: "status",
        header: "Status",
        render: (report) => <StatusBadge status={report.lastRunStatus} />,
    },
    {
        key: "open",
        header: <span className="sr-only">Open</span>,
        className: "px-3 py-3.25 text-right",
        render: (report) => (
            <Link
                href={reportHref(report.id)}
                prefetch={false}
                aria-label={`Open ${report.name}`}
                className="inline-flex text-(--accent-2)"
            >
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
        ),
    },
];

export function ReportsTable({ reports }: { reports: readonly SavedReport[] }) {
    return (
        <DataTable
            accessibleLabel="Saved reports"
            columns={COLUMNS}
            data={reports}
            rowKeyAction={(report) => report.id}
            footerNote={`${reports.length} saved ${reports.length === 1 ? "report" : "reports"}`}
            emptyMessage="No saved reports yet."
            rowTestId="report-row"
            testId="reports-table"
        />
    );
}
