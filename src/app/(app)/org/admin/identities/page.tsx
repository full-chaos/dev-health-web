import Link from "next/link";
import { Plus } from "lucide-react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { IdentityTable } from "@/components/admin/identities/IdentityTable";
import { buttonClassName } from "@/components/shared/Button";
import { Notice } from "@/components/ui/Notice";
import { RetryButton } from "@/components/ui/RetryButton";
import { listIdentities, listTeams } from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import { logger } from "@/lib/logger";

export default async function IdentitiesPage() {
    const [result, teamsResult] = await Promise.all([listIdentities(), listTeams()]);

    if (result.error) {
        // The backend text goes to the server log, never to the page (one plain sentence + Retry).
        logger.error({ err: result.error }, "Failed to load identities");
    }

    // Team names for the Team column (served team_id/name). A failed team list is not an error of
    // this page: the labels degrade to short id + Unresolved.
    if (teamsResult.error) {
        logger.error({ err: teamsResult.error }, "Failed to load teams for the Identities page");
    }
    const teamNames = Object.fromEntries((teamsResult.data ?? []).map((t) => [t.team_id, t.name]));

    return (
        <div className="space-y-6">
            <AdminHeader
                title="Organization"
                description="Manage developer identities and map them to teams."
            >
                <Link href="/org/admin/identities/new" className={buttonClassName("primary", "md")}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    {CTA_LABELS.addIdentity}
                </Link>
            </AdminHeader>

            {result.error ? (
                <Notice variant="danger" live={false} action={<RetryButton />}>
                    Identities could not be loaded. Retry, or check again in a moment.
                </Notice>
            ) : (
                <IdentityTable
                    teamNames={teamNames}
                    identities={(result.data ?? []).map((i) => ({
                        canonical_id: i.canonical_id,
                        display_name: i.display_name,
                        email: i.email,
                        team_ids: i.team_ids,
                        provider_identities: i.provider_identities,
                    }))}
                />
            )}
        </div>
    );
}
