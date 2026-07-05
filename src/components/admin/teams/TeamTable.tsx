"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { CTA_LABELS } from "@/lib/design/cta";

export type Team = {
    team_id: string;
    name: string;
    description: string | null;
    repo_patterns: string[];
    project_keys: string[];
};

type TeamTableProps = {
    teams: Team[];
    onDeleteAction?: (teamId: string) => void;
};

function includesSearch(value: string | null | undefined, query: string): boolean {
    return value?.toLowerCase().includes(query) ?? false;
}

function teamMatchesSearch(team: Team, query: string): boolean {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        return true;
    }

    return (
        includesSearch(team.name, normalizedQuery) ||
        includesSearch(team.team_id, normalizedQuery) ||
        includesSearch(team.description, normalizedQuery) ||
        team.repo_patterns.some((pattern) => includesSearch(pattern, normalizedQuery)) ||
        team.project_keys.some((key) => includesSearch(key, normalizedQuery))
    );
}

export function TeamTable({ teams, onDeleteAction }: TeamTableProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const filteredTeams = useMemo(
        () => teams.filter((team) => teamMatchesSearch(team, searchQuery)),
        [teams, searchQuery],
    );
    const columns: DataTableColumn<Team>[] = [
        {
            key: "name",
            header: "Name",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 font-medium text-foreground",
            render: (team) => (
                <Link href={`/org/admin/teams/${team.team_id}/edit`} className="hover:underline">
                    {team.name}
                </Link>
            ),
        },
        {
            key: "description",
            header: "Description",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-(--ink-muted)",
            render: (team) => team.description ?? "-",
        },
        {
            key: "repo_patterns",
            header: "Repo Patterns",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-(--ink-muted)",
            render: (team) => (
                <div className="flex flex-wrap gap-1">
                    {(team.repo_patterns ?? []).map((pattern) => (
                        <span
                            key={pattern}
                            className="rounded bg-(--card-70) px-1.5 py-0.5 text-xs"
                        >
                            {pattern}
                        </span>
                    ))}
                </div>
            ),
        },
        {
            key: "project_keys",
            header: "Project Keys",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-(--ink-muted)",
            render: (team) => (
                <div className="flex flex-wrap gap-1">
                    {(team.project_keys ?? []).map((key) => (
                        <span key={key} className="rounded bg-(--card-70) px-1.5 py-0.5 text-xs">
                            {key}
                        </span>
                    ))}
                </div>
            ),
        },
        {
            key: "actions",
            header: "Actions",
            headerClassName: "px-6 py-4 text-right font-medium",
            className: "px-6 py-4 text-right",
            render: (team) => (
                <div className="flex justify-end gap-3">
                    <Link
                        href={`/org/admin/teams/${team.team_id}/edit`}
                        className="text-(--accent) hover:underline"
                    >
                        {CTA_LABELS.edit}
                    </Link>
                    {onDeleteAction && (
                        <button
                            type="button"
                            onClick={() => onDeleteAction(team.team_id)}
                            className="text-red-500 hover:underline"
                        >
                            {CTA_LABELS.delete}
                        </button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <DataTable
            columns={columns}
            data={filteredTeams}
            rowKeyAction={(team) => team.team_id}
            emptyColSpan={5}
            emptyMessage={teams.length === 0 ? "No teams found." : "No teams match your search."}
            search={{
                value: searchQuery,
                placeholder: "Search teams",
                buttonLabel: CTA_LABELS.applyFilters,
            }}
            onSearchAction={setSearchQuery}
            onSearchChangeAction={setSearchQuery}
        />
    );
}
