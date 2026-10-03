import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck, Info } from "lucide-react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { buttonClassName } from "@/components/shared/Button";
import { Notice } from "@/components/ui/Notice";
import { Section } from "@/components/ui/Section";
import { STATUS_PILL } from "@/lib/statusPill";
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
    /** Marks the tile with an "Attention" pill (a served count above zero). */
    attention?: boolean;
};

// One tile of the joined strip (design A1): caps label, value, sentence, link with the arrow first.
function SignalCard({ title, value, description, href, action, attention }: SignalCardProps) {
    return (
        <section className="flex min-w-0 flex-col gap-0 p-5.25">
            <div className="flex items-start justify-between gap-2">
                <p className="text-label-caps uppercase text-(--ink-muted)">{title}</p>
                {attention ? (
                    <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL.caution}`}
                    >
                        <CircleAlert aria-hidden="true" className="h-3 w-3" />
                        Attention
                    </span>
                ) : null}
            </div>
            <p className="mt-3 text-3xl font-semibold text-foreground">{value}</p>
            <p className="mt-2 mb-4 text-xs text-(--ink-muted)">{description}</p>
            <Link
                href={href}
                className={`${buttonClassName("ghost", "sm")} mt-auto w-fit gap-1.75 px-0`}
            >
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                {action}
            </Link>
        </section>
    );
}

// One line of the setup checklist: a check when the served condition holds, an info mark when not.
function SetupLine({ done, children }: { done: boolean; children: string }) {
    const Icon = done ? CircleCheck : Info;
    return (
        <li className="flex items-center gap-3 border-b border-(--card-stroke) py-2.5 text-sm last:border-b-0">
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-(--ink-muted)" />
            <span>{children}</span>
        </li>
    );
}

/**
 * Boundary guard: admin list actions are typed to return arrays, but a
 * misbehaving backend/mock payload (e.g. a paginated envelope) must degrade
 * to the partial-signals banner instead of throwing during RSC render.
 */
function asList<T>(value: T[] | undefined): T[] {
    return Array.isArray(value) ? value : [];
}

function isMalformedList(value: unknown): boolean {
    return value !== undefined && !Array.isArray(value);
}

export default async function AdminDashboardPage() {
    const [
        usersResult,
        teamsResult,
        identitiesResult,
        credentialsResult,
        syncResult,
        pendingResult,
    ] = await Promise.all([
        listUsers(),
        listTeams(),
        listIdentities(),
        listCredentials(),
        listSyncConfigs(),
        getPendingTeamChanges(),
    ]);
    const users = asList(usersResult.data);
    const teams = asList(teamsResult.data);
    const identities = asList(identitiesResult.data);
    const credentials = asList(credentialsResult.data);
    const syncConfigs = asList(syncResult.data);
    const pendingTotal = pendingResult.data?.total;
    const pendingTeamChanges = typeof pendingTotal === "number" ? pendingTotal : 0;
    const invitedUsers = users.filter((adminUser) => !adminUser.is_verified).length;
    const unassignedIdentities = identities.filter(
        (identity) => identity.team_ids.length === 0,
    ).length;
    const activeCredentials = credentials.filter((credential) => credential.is_active).length;
    const failingCredentials = credentials.filter(
        (credential) => credential.last_test_success === false,
    ).length;
    const failingSyncConfigs = syncConfigs.filter(
        (config) => config.last_sync_success === false,
    ).length;
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
    const malformedSignals = [
        usersResult.data,
        teamsResult.data,
        identitiesResult.data,
        credentialsResult.data,
        syncResult.data,
    ].filter(isMalformedList).length;
    const loadErrors = [
        usersResult.error,
        teamsResult.error,
        identitiesResult.error,
        credentialsResult.error,
        syncResult.error,
        pendingResult.error,
    ].filter(Boolean);
    const hasPartialSignals = loadErrors.length > 0 || malformedSignals > 0;

    return (
        <div className="space-y-8">
            <AdminHeader
                title="Organization"
                description="System configuration and management for this organization."
            />

            {hasPartialSignals && (
                <Notice variant="warn">
                    Some admin signals could not load. The available signals below may be partial.
                </Notice>
            )}

            <div
                data-testid="admin-signal-strip"
                className="grid divide-y divide-(--card-stroke) overflow-hidden rounded-(--radius-md) border border-(--card-stroke) bg-card md:grid-cols-2 md:divide-y-0 xl:grid-cols-4 xl:divide-x"
            >
                <SignalCard
                    title="Needs attention"
                    value={needsAttention}
                    description={`${pendingTeamChanges} team mapping changes, ${failingCredentials} credential issues, ${failingSyncConfigs} sync failures.`}
                    href={attentionHref}
                    action={attentionAction}
                    attention={needsAttention > 0}
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
                />
                <SignalCard
                    title="Active sync configs"
                    value={activeSyncConfigs}
                    description={`${syncConfigs.length} total configs; ${failingSyncConfigs} reported a failed last run.`}
                    href="/org/admin/sync"
                    action={CTA_LABELS.openSyncStatus}
                />
            </div>

            <section className="grid gap-6 lg:grid-cols-2">
                <Section title="Organization roster">
                    <dl className="grid gap-4 sm:grid-cols-3">
                        <div>
                            <dt className="text-label-caps uppercase text-(--ink-muted)">Users</dt>
                            <dd className="mt-1 text-2xl font-semibold">{users.length}</dd>
                            <p className="mt-1 text-xs text-(--ink-muted)">
                                {invitedUsers} invited
                            </p>
                        </div>
                        <div>
                            <dt className="text-label-caps uppercase text-(--ink-muted)">Teams</dt>
                            <dd className="mt-1 text-2xl font-semibold">{teams.length}</dd>
                            <p className="mt-1 text-xs text-(--ink-muted)">
                                {unmappedTeams} unmapped
                            </p>
                        </div>
                        <div>
                            <dt className="text-label-caps uppercase text-(--ink-muted)">
                                Identities
                            </dt>
                            <dd className="mt-1 text-2xl font-semibold">{identities.length}</dd>
                            <p className="mt-1 text-xs text-(--ink-muted)">
                                {unassignedIdentities} unassigned
                            </p>
                        </div>
                    </dl>
                </Section>

                <Section title="Setup progress">
                    <ul data-testid="setup-checklist">
                        <SetupLine done={credentials.length > 0}>
                            {credentials.length > 0
                                ? "At least one integration credential is configured."
                                : "No integration credentials are configured yet."}
                        </SetupLine>
                        <SetupLine done={syncConfigs.length > 0}>
                            {syncConfigs.length > 0
                                ? "Sync configuration exists for connected sources."
                                : "Create a sync configuration after connecting a source."}
                        </SetupLine>
                        <SetupLine done={teams.length > 0}>
                            {teams.length > 0
                                ? "Team ownership mappings are available for review."
                                : "Add teams so ownership and identity mapping can be reviewed."}
                        </SetupLine>
                    </ul>
                </Section>
            </section>
        </div>
    );
}
