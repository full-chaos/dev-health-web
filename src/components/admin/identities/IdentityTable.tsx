"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EntityLabel } from "@/components/labels/EntityLabel";
import { ProviderBadge } from "./ProviderBadge";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { UNRESOLVED } from "@/lib/labels/unresolved";

export type Identity = {
    canonical_id: string;
    display_name: string | null;
    email: string | null;
    team_ids: string[];
    provider_identities: Record<string, string[]>;
};

type IdentityTableProps = {
    identities: Identity[];
    /** Served team names by team id (from the team list). A team without a name reads short id + Unresolved. */
    teamNames?: Record<string, string>;
    onDeleteAction?: (id: string) => void;
};

function includesSearch(value: string | null | undefined, query: string): boolean {
    return value?.toLowerCase().includes(query) ?? false;
}

function identityMatchesSearch(
    identity: Identity,
    query: string,
    teamNames: Record<string, string>,
): boolean {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        return true;
    }

    return (
        includesSearch(identity.canonical_id, normalizedQuery) ||
        includesSearch(identity.display_name, normalizedQuery) ||
        includesSearch(identity.email, normalizedQuery) ||
        identity.team_ids.some(
            (teamId) =>
                includesSearch(teamId, normalizedQuery) ||
                includesSearch(teamNames[teamId], normalizedQuery),
        ) ||
        Object.entries(identity.provider_identities).some(
            ([provider, usernames]) =>
                includesSearch(provider, normalizedQuery) ||
                usernames.some((username) => includesSearch(username, normalizedQuery)),
        )
    );
}

export function IdentityTable({ identities, teamNames = {}, onDeleteAction }: IdentityTableProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const filteredIdentities = useMemo(
        () =>
            identities.filter((identity) =>
                identityMatchesSearch(identity, searchQuery, teamNames),
            ),
        [identities, searchQuery, teamNames],
    );
    const columns: DataTableColumn<Identity>[] = [
        {
            key: "canonical",
            header: "Identity",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 font-medium text-foreground",
            render: (identity) => (
                <Link
                    href={`/org/admin/identities/${identity.canonical_id}/edit`}
                    className="text-sm hover:underline"
                >
                    {identity.display_name?.trim() || identity.email?.trim() || UNRESOLVED}
                </Link>
            ),
        },
        {
            key: "display",
            header: "Display Name",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 font-semibold text-foreground",
            render: (identity) => identity.display_name ?? "—",
        },
        {
            key: "email",
            header: "Email",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-(--ink-muted)",
            render: (identity) => identity.email ?? "—",
        },
        {
            key: "team",
            header: "Team",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-(--ink-muted)",
            render: (identity) => {
                const teamIds = identity.team_ids ?? [];
                return teamIds.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        {teamIds.map((teamId) => (
                            <Link
                                key={teamId}
                                href={`/org/admin/teams/${teamId}/edit`}
                                className="text-(--accent-2) hover:underline"
                            >
                                <EntityLabel id={teamId} nameMap={teamNames} />
                            </Link>
                        ))}
                    </div>
                ) : (
                    <span className="text-(--ink-muted)/50">Unassigned</span>
                );
            },
        },
        {
            key: "providers",
            header: "Provider Identities",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4",
            render: (identity) => {
                const providerIdentities = identity.provider_identities ?? {};
                return (
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(providerIdentities).flatMap(([provider, usernames]) =>
                            usernames.map((username) => (
                                <ProviderBadge
                                    key={`${identity.canonical_id}-${provider}-${username}`}
                                    provider={provider}
                                    username={username}
                                />
                            )),
                        )}
                    </div>
                );
            },
        },
        {
            key: "actions",
            header: "Actions",
            headerClassName: "px-6 py-4 text-right font-medium",
            className: "px-6 py-4 text-right",
            render: (identity) => (
                <div className="flex justify-end gap-3">
                    <Link
                        href={`/org/admin/identities/${identity.canonical_id}/edit`}
                        className="text-(--accent-2) hover:underline"
                    >
                        {CTA_LABELS.edit}
                    </Link>
                    {onDeleteAction && (
                        <button
                            type="button"
                            onClick={() => onDeleteAction(identity.canonical_id)}
                            className="text-(--negative) hover:underline"
                        >
                            {CTA_LABELS.delete}
                        </button>
                    )}
                </div>
            ),
        },
    ];

    const countNote =
        filteredIdentities.length === identities.length
            ? `${identities.length} ${identities.length === 1 ? "identity" : "identities"}`
            : `${filteredIdentities.length} of ${identities.length} identities`;

    return (
        <Section title="Identities">
            <DataTable
                accessibleLabel="Identities"
                columns={columns}
                data={filteredIdentities}
                rowKeyAction={(identity) => identity.canonical_id}
                emptyColSpan={6}
                emptyMessage={
                    identities.length === 0
                        ? "No identities found."
                        : "No identities match your search."
                }
                search={{
                    value: searchQuery,
                    placeholder: "Search identities",
                    buttonLabel: CTA_LABELS.applyFilters,
                }}
                onSearchAction={setSearchQuery}
                onSearchChangeAction={setSearchQuery}
                footerNote={countNote}
            />
        </Section>
    );
}
