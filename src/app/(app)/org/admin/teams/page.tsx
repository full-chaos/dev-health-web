import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { TeamTable } from "@/components/admin/teams/TeamTable";
import { ImportTeamsDialog } from "@/components/admin/teams/ImportTeamsDialog";
import { PendingChangesPanel } from "@/components/admin/teams/PendingChangesPanel";
import { listTeams, getPendingTeamChanges } from "@/lib/admin/server";

export default async function TeamsPage() {
    const [result, pendingResult] = await Promise.all([listTeams(), getPendingTeamChanges()]);
    const pendingCount = pendingResult.data?.total ?? 0;

    return (
        <div>
            <AdminHeader
                title="Teams"
                description="Manage teams and their resource ownership mappings."
            >
                <div className="flex items-center gap-2">
                    {pendingCount > 0 && (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">
                            {pendingCount} pending
                        </span>
                    )}
                    <ImportTeamsDialog />
                    <Link
                        href="/org/admin/teams/new"
                        className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
                    >
                        Add Team
                    </Link>
                </div>
            </AdminHeader>

            <PendingChangesPanel />

            {result.error && (
                <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
                    Failed to load teams: {result.error}
                </div>
            )}

            <div className="mb-6 flex gap-4">
                <input
                    type="text"
                    placeholder="Search teams..."
                    className="w-full max-w-sm rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                />
            </div>

            <TeamTable
                teams={(result.data ?? []).map((t) => ({
                    team_id: t.team_id,
                    name: t.name,
                    description: t.description,
                    repo_patterns: t.repo_patterns,
                    project_keys: t.project_keys,
                }))}
            />
        </div>
    );
}
