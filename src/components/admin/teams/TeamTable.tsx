import React from "react";
import Link from "next/link";

export type Team = {
  team_id: string;
  name: string;
  description: string;
  repo_patterns: string[];
  project_keys: string[];
};

type TeamTableProps = {
  teams: Team[];
  onDelete?: (teamId: string) => void;
};

export function TeamTable({ teams, onDelete }: TeamTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
          <tr>
            <th className="px-6 py-4 font-medium">Name</th>
            <th className="px-6 py-4 font-medium">Description</th>
            <th className="px-6 py-4 font-medium">Repo Patterns</th>
            <th className="px-6 py-4 font-medium">Project Keys</th>
            <th className="px-6 py-4 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--card-stroke)">
          {teams.map((team) => (
            <tr key={team.team_id} className="hover:bg-(--card-70)/50">
              <td className="px-6 py-4 font-medium text-foreground">
                <Link href={`/admin/teams/${team.team_id}/edit`} className="hover:underline">
                  {team.name}
                </Link>
              </td>
              <td className="px-6 py-4 text-(--ink-muted)">{team.description}</td>
              <td className="px-6 py-4 text-(--ink-muted)">
                <div className="flex flex-wrap gap-1">
                  {team.repo_patterns.map((pattern, i) => (
                    <span key={i} className="rounded bg-(--card-70) px-1.5 py-0.5 text-xs">
                      {pattern}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-6 py-4 text-(--ink-muted)">
                <div className="flex flex-wrap gap-1">
                  {team.project_keys.map((key, i) => (
                    <span key={i} className="rounded bg-(--card-70) px-1.5 py-0.5 text-xs">
                      {key}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-3">
                  <Link
                    href={`/admin/teams/${team.team_id}/edit`}
                    className="text-(--accent) hover:underline"
                  >
                    Edit
                  </Link>
                  {onDelete && (
                    <button
                      onClick={() => onDelete(team.team_id)}
                      className="text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {teams.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-8 text-center text-(--ink-muted)">
                No teams found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
