"use client";

import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";

export type Team = {
  team_id: string;
  name: string;
  description: string | null;
  repo_patterns: string[];
  project_keys: string[];
};

type TeamTableProps = {
  teams: Team[];
  onDelete?: (teamId: string) => void;
};

export function TeamTable({ teams, onDelete }: TeamTableProps) {
  const columns: DataTableColumn<Team>[] = [
    {
      key: "name",
      header: "Name",
      headerClassName: "px-6 py-4 font-medium",
      className: "px-6 py-4 font-medium text-foreground",
      render: (team) => (
        <Link href={`/admin/teams/${team.team_id}/edit`} className="hover:underline">
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
            <span key={pattern} className="rounded bg-(--card-70) px-1.5 py-0.5 text-xs">
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
            href={`/admin/teams/${team.team_id}/edit`}
            className="text-(--accent) hover:underline"
          >
            Edit
          </Link>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(team.team_id)}
              className="text-red-500 hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={teams}
      rowKeyAction={(team) => team.team_id}
      emptyColSpan={5}
      emptyMessage="No teams found."
    />
  );
}
