import Link from "next/link";
import { Clock, Plus } from "lucide-react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { StatusPill } from "@/components/admin/StatusPill";
import { ImportTeamsDialog } from "@/components/admin/teams/ImportTeamsDialog";
import { PendingChangesPanel } from "@/components/admin/teams/PendingChangesPanel";
import { TeamTable } from "@/components/admin/teams/TeamTable";
import { buttonClassName } from "@/components/shared/Button";
import { Notice } from "@/components/ui/Notice";
import { RetryButton } from "@/components/ui/RetryButton";
import { getPendingTeamChanges, listTeams } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import { logger } from "@/lib/logger";

export default async function TeamsPage() {
    const [result, pendingResult] = await Promise.all([listTeams(), getPendingTeamChanges()]);
    const pendingCount = pendingResult.data?.total ?? 0;

    if (result.error) {
        // The backend text goes to the server log, never to the page (one plain sentence + Retry).
        logger.error({ err: result.error }, "Failed to load teams");
    }

    return (
        <div className="space-y-6">
            <AdminHeader
                title="Organization"
                description="Manage teams and their resource ownership mappings."
            >
                <div className="flex items-center gap-2">
                    {pendingCount > 0 && (
                        <StatusPill tone="caution" icon={Clock}>
                            {pendingCount} pending
                        </StatusPill>
                    )}
                    <ImportTeamsDialog />
                    <Link href="/org/admin/teams/new" className={buttonClassName("primary", "md")}>
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        {CTA_LABELS.addTeam}
                    </Link>
                </div>
            </AdminHeader>

            <PendingChangesPanel />

            {result.error ? (
                <Notice variant="danger" live={false} action={<RetryButton />}>
                    Teams could not be loaded. Retry, or check again in a moment.
                </Notice>
            ) : (
                <TeamTable
                    teams={(result.data ?? []).map((t) => ({
                        team_id: t.team_id,
                        name: t.name,
                        description: t.description,
                        repo_patterns: t.repo_patterns,
                        project_keys: t.project_keys,
                    }))}
                />
            )}
        </div>
    );
}
