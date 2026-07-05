import { auth } from "@/lib/auth";
import { AdminHeader } from "@/components/admin/AdminHeader";
import Link from "next/link";
import {
    getPendingTeamChanges,
    listCredentials,
    listIdentities,
    listSyncConfigs,
    listTeams,
    listUsers,
} from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";

type SignalCardProps = {
    title: string;
    value: string | number;
    description: string;
    href: string;
    action: string;
    tone?: "default" | "attention" | "positive";
};

function SignalCard({
    title,
    value,
    description,
    href,
    action,
    tone = "default",
}: SignalCardProps) {
    const toneClass =
        tone === "attention"
            ? "border-amber-500/30 bg-amber-500/10"
            : tone === "positive"
              ? "border-green-500/25 bg-green-500/10"
              : "border-(--card-stroke) bg-(--card-80)";

    return (
        <section className={`rounded-xl border p-6 ${toneClass}`}>
            <p className="text-label-caps uppercase text-(--ink-muted)">{title}</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">{value}</p>
            <p className="mt-2 min-h-11 text-sm text-(--ink-muted)">{description}</p>
            <Link
                href={href}
                className="mt-4 inline-flex text-sm font-medium text-(--accent) hover:underline"
            >
                {action}
            </Link>
        </section>
    );
}

export default async function AdminDashboardPage() {
    const [session, usersResult, teamsResult, identitiesResult, credentialsResult, syncResult, pendingResult] =
        await Promise.all([
            auth(),
            listUsers(),
            listTeams(),
            listIdentities(),
            listCredentials(),
            listSyncConfigs(),
            getPendingTeamChanges(),
        ]);
    const user = session?.user;
    const users = usersResult.data ?? [];
    const teams = teamsResult.data ?? [];
    const identities = identitiesResult.data ?? [];
    const credentials = credentialsResult.data ?? [];
    const syncConfigs = syncResult.data ?? [];
    const pendingTeamChanges = pendingResult.data?.total ?? 0;
    const invitedUsers = users.filter((adminUser) => !adminUser.is_verified).length;
    const unassignedIdentities = identities.filter((identity) => identity.team_ids.length === 0).length;
    const activeCredentials = credentials.filter((credential) => credential.is_active).length;
    const failingCredentials = credentials.filter(
        (credential) => credential.last_test_success === false,
    ).length;
    const failingSyncConfigs = syncConfigs.filter((config) => config.last_sync_success === false).length;
    const activeSyncConfigs = syncConfigs.filter((config) => config.is_active).length;
    const unmappedTeams = teams.filter(
        (team) => team.repo_patterns.length === 0 && team.project_keys.length === 0,
    ).length;
    const needsAttention = pendingTeamChanges + failingCredentials + failingSyncConfigs;
    const attentionHref =
        pendingTeamChanges > 0
            ? "/org/admin/teams"
            : failingCredentials > 0
              ? "/org/admin/integrations"
              : "/org/admin/sync";
    const attentionAction =
        pendingTeamChanges > 0
            ? CTA_LABELS.reviewIssues
            : failingCredentials > 0
              ? CTA_LABELS.manageConnections
              : CTA_LABELS.reviewSyncHealth;
    const loadErrors = [
        usersResult.error,
        teamsResult.error,
        identitiesResult.error,
        credentialsResult.error,
        syncResult.error,
        pendingResult.error,
    ].filter(Boolean);

    return (
        <div className="space-y-8">
            <AdminHeader
                title="Admin Dashboard"
                description={`Welcome back, ${user?.name || user?.email}.`}
                breadcrumbs={[{ label: "Home", href: "/dashboard" }, { label: "Admin" }]}
            />

            {loadErrors.length > 0 && (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
                    Some admin signals could not load. The available signals below may be partial.
                </div>
            )}

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                <SignalCard
                    title="Needs attention"
                    value={needsAttention}
                    description={`${pendingTeamChanges} team mapping changes, ${failingCredentials} credential issues, ${failingSyncConfigs} sync failures.`}
                    href={attentionHref}
                    action={attentionAction}
                    tone={needsAttention > 0 ? "attention" : "positive"}
                />
                <SignalCard
                    title="Connected sources"
                    value={activeCredentials}
                    description={`${credentials.length} saved credentials across ${new Set(credentials.map((credential) => credential.provider)).size} providers.`}
                    href="/org/admin/integrations"
                    action={CTA_LABELS.manageConnections}
                />
                <SignalCard
                    title="Identity coverage"
                    value={`${Math.max(0, identities.length - unassignedIdentities)}/${identities.length}`}
                    description={`${unassignedIdentities} identities are not assigned to a team.`}
                    href="/org/admin/identities"
                    action={CTA_LABELS.reviewIdentities}
                    tone={unassignedIdentities > 0 ? "attention" : "positive"}
                />
                <SignalCard
                    title="Active sync configs"
                    value={activeSyncConfigs}
                    description={`${syncConfigs.length} total configs; ${failingSyncConfigs} reported a failed last run.`}
                    href="/org/admin/sync"
                    action={CTA_LABELS.openSyncStatus}
                    tone={failingSyncConfigs > 0 ? "attention" : "default"}
                />
            </div>

            <section className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <h2 className="text-lg font-medium text-foreground">Organization roster</h2>
                    <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                        <div>
                            <dt className="text-label-caps uppercase text-(--ink-muted)">Users</dt>
                            <dd className="mt-1 text-2xl font-semibold">{users.length}</dd>
                            <p className="mt-1 text-xs text-(--ink-muted)">{invitedUsers} invited</p>
                        </div>
                        <div>
                            <dt className="text-label-caps uppercase text-(--ink-muted)">Teams</dt>
                            <dd className="mt-1 text-2xl font-semibold">{teams.length}</dd>
                            <p className="mt-1 text-xs text-(--ink-muted)">{unmappedTeams} unmapped</p>
                        </div>
                        <div>
                            <dt className="text-label-caps uppercase text-(--ink-muted)">Identities</dt>
                            <dd className="mt-1 text-2xl font-semibold">{identities.length}</dd>
                            <p className="mt-1 text-xs text-(--ink-muted)">{unassignedIdentities} unassigned</p>
                        </div>
                    </dl>
                </div>

                <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <h2 className="text-lg font-medium text-foreground">Setup progress</h2>
                    <div className="mt-4 space-y-3 text-sm text-(--ink-muted)">
                        <p>
                            {credentials.length > 0
                                ? "At least one integration credential is configured."
                                : "No integration credentials are configured yet."}
                        </p>
                        <p>
                            {syncConfigs.length > 0
                                ? "Sync configuration exists for connected sources."
                                : "Create a sync configuration after connecting a source."}
                        </p>
                        <p>
                            {teams.length > 0
                                ? "Team ownership mappings are available for review."
                                : "Add teams so ownership and identity mapping can be reviewed."}
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
