"use client";

import Link from "next/link";
import { ProviderBadge } from "./ProviderBadge";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";

export type Identity = {
    canonical_id: string;
    display_name: string | null;
    email: string | null;
    team_ids: string[];
    provider_identities: Record<string, string[]>;
};

type IdentityTableProps = {
    identities: Identity[];
    onDelete?: (id: string) => void;
};

export function IdentityTable({ identities, onDelete }: IdentityTableProps) {
    const columns: DataTableColumn<Identity>[] = [
        {
            key: "canonical",
            header: "Canonical ID",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 font-medium text-foreground",
            render: (identity) => (
                <Link
                    href={`/admin/identities/${identity.canonical_id}/edit`}
                    className="hover:underline"
                >
                    {identity.canonical_id}
                </Link>
            ),
        },
        {
            key: "display",
            header: "Display Name",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-(--ink-muted)",
            render: (identity) => identity.display_name ?? "-",
        },
        {
            key: "email",
            header: "Email",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-(--ink-muted)",
            render: (identity) => identity.email ?? "-",
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
                                href={`/admin/teams/${teamId}/edit`}
                                className="text-(--accent) hover:underline"
                            >
                                {teamId}
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
                        href={`/admin/identities/${identity.canonical_id}/edit`}
                        className="text-(--accent) hover:underline"
                    >
                        Edit
                    </Link>
                    {onDelete && (
                        <button
                            type="button"
                            onClick={() => onDelete(identity.canonical_id)}
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
            data={identities}
            rowKeyAction={(identity) => identity.canonical_id}
            emptyColSpan={6}
            emptyMessage="No identities found."
        />
    );
}
