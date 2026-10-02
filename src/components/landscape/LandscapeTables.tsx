"use client";

import type { ReactNode } from "react";

import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { formatNumber } from "@/lib/formatters";

/**
 * The four Landscape tables, on the shared DataTable. DataTable is a client
 * component whose columns hold render functions, and a server component cannot
 * pass functions to it: so the views (server) pass plain rows with only the
 * fields a table prints, and the functions are built here.
 *
 * Rows arrive sorted (and capped) by the views, as before. There is no sort,
 * no paging and no row action. The first column keeps its medium weight, the
 * numeric columns are right-aligned tabular figures.
 */

const FIRST = "px-5 py-3 align-middle font-medium";
const MUTED = "px-5 py-3 align-middle text-(--ink-muted)";
const CELL = "px-5 py-3";
const HEADER = "px-5 py-3 font-medium";

function toColumns<T>(
    spec: Array<{
        key: string;
        header: string;
        render: (row: T) => ReactNode;
        numeric?: boolean;
        className?: string;
    }>,
): DataTableColumn<T>[] {
    return spec.map((column) => ({
        key: column.key,
        header: column.header,
        render: column.render,
        numeric: column.numeric,
        className: column.className ?? CELL,
        headerClassName: HEADER,
    }));
}

// ── Teams ────────────────────────────────────────────────────────────────────

export type TeamsTableRow = {
    id: string;
    label: string;
    throughput: number;
    cycle: number;
    /** `null` = no churn point for this team (shown as an em dash, never 0). */
    churn: number | null;
};

const TEAMS_COLUMNS = toColumns<TeamsTableRow>([
    { key: "team", header: "Team", render: (r) => r.label, className: FIRST },
    {
        key: "throughput",
        header: "Throughput (items)",
        numeric: true,
        render: (r) => formatNumber(r.throughput, { maximumFractionDigits: 1 }),
    },
    {
        key: "cycle",
        header: "Cycle time (days)",
        numeric: true,
        render: (r) => formatNumber(r.cycle, { maximumFractionDigits: 1 }),
    },
    {
        key: "churn",
        header: "Churn (loc)",
        numeric: true,
        render: (r) =>
            r.churn === null ? "—" : formatNumber(r.churn, { maximumFractionDigits: 0 }),
    },
]);

export function TeamsTable({ rows }: { rows: TeamsTableRow[] }) {
    return (
        <DataTable
            accessibleLabel="Teams"
            columns={TEAMS_COLUMNS}
            data={rows}
            rowKeyAction={(r) => r.id}
            emptyMessage="No team data"
            testId="teams-table"
            rowTestId="teams-row"
        />
    );
}

// ── Repos ────────────────────────────────────────────────────────────────────

export type ReposTableRow = {
    repoName: string;
    files: number;
    churn: number;
    avgRisk: number;
};

const REPOS_COLUMNS = toColumns<ReposTableRow>([
    { key: "repo", header: "Repo", render: (r) => r.repoName, className: FIRST },
    { key: "files", header: "Hotspot files", numeric: true, render: (r) => formatNumber(r.files) },
    { key: "churn", header: "Churn LOC 30d", numeric: true, render: (r) => formatNumber(r.churn) },
    {
        key: "risk",
        header: "Avg risk",
        numeric: true,
        render: (r) => formatNumber(r.avgRisk, { maximumFractionDigits: 3 }),
    },
]);

export function ReposTable({ rows }: { rows: ReposTableRow[] }) {
    return (
        <DataTable
            accessibleLabel="Repos"
            columns={REPOS_COLUMNS}
            data={rows}
            rowKeyAction={(r) => r.repoName}
            emptyMessage="No repository data"
            testId="repos-table"
            rowTestId="repos-row"
        />
    );
}

// ── Ownership ────────────────────────────────────────────────────────────────

export type OwnershipTableRow = {
    repoId: string;
    repoName: string;
    value: number;
    /** The top maintainer as the page shows it today (decision on person data is open). */
    topAuthor: string | null;
    topSharePercent: number | null;
};

const OWNERSHIP_COLUMNS = toColumns<OwnershipTableRow>([
    { key: "repo", header: "Repo", render: (r) => r.repoName, className: FIRST },
    {
        key: "busFactor",
        header: "Bus factor",
        numeric: true,
        render: (r) => formatNumber(r.value, { maximumFractionDigits: 1 }),
    },
    {
        key: "maintainer",
        header: "Top maintainer",
        render: (r) => (r.topAuthor === null ? "—" : r.topAuthor),
        className: MUTED,
    },
    {
        key: "share",
        header: "Share",
        numeric: true,
        render: (r) => (r.topSharePercent === null ? "—" : `${Math.round(r.topSharePercent)}%`),
    },
]);

export function OwnershipTable({ rows }: { rows: OwnershipTableRow[] }) {
    return (
        <DataTable
            accessibleLabel="Ownership risk"
            columns={OWNERSHIP_COLUMNS}
            data={rows}
            rowKeyAction={(r) => r.repoId}
            emptyMessage="No ownership data"
            testId="ownership-table"
            rowTestId="ownership-row"
        />
    );
}

// ── Hotspots ─────────────────────────────────────────────────────────────────

export type HotspotsTableRow = {
    key: string;
    fileName: string;
    filePath: string;
    repoName: string;
    riskScore: number;
    churnLoc30d: number;
};

const HOTSPOTS_COLUMNS = toColumns<HotspotsTableRow>([
    {
        key: "file",
        header: "File",
        render: (r) => <span title={r.filePath}>{r.fileName}</span>,
        className: "px-5 py-3 align-middle font-mono text-[0.82em]",
    },
    { key: "repo", header: "Repo", render: (r) => r.repoName, className: MUTED },
    {
        key: "risk",
        header: "Risk score",
        numeric: true,
        render: (r) => formatNumber(r.riskScore, { maximumFractionDigits: 3 }),
    },
    {
        key: "churn",
        header: "Churn LOC 30d",
        numeric: true,
        render: (r) => formatNumber(r.churnLoc30d),
    },
]);

export function HotspotsTable({ rows }: { rows: HotspotsTableRow[] }) {
    return (
        <DataTable
            accessibleLabel="Hotspots"
            columns={HOTSPOTS_COLUMNS}
            data={rows}
            rowKeyAction={(r) => r.key}
            emptyMessage="No hotspot files"
            testId="hotspots-table"
            rowTestId="hotspots-row"
        />
    );
}
