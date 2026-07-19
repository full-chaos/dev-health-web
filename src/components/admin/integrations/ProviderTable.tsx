"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { ConnectionStatus, type ConnectionStatusType } from "./ConnectionStatus";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatDateTimeUTC } from "@/lib/formatters";
import type { Provider } from "@/lib/admin/types";

export type ProviderRow = {
    id: Provider;
    name: string;
    description: string;
    icon: ReactNode;
    status: ConnectionStatusType;
    credentialCount: number;
    /** The single credential's name when there's exactly one; null otherwise. */
    singleCredentialName: string | null;
    /** Auth method label when there's exactly one credential; null when 0 or mixed. */
    authMethodLabel: string | null;
    /** Most recent `last_test_at` across this provider's credentials, if any. */
    lastTestedAt: string | null;
    /** Sync configurations that reference any of this provider's credentials. */
    syncConfigCount: number;
};

type ProviderTableProps = {
    providers: ProviderRow[];
};

function credentialCell(row: ProviderRow): ReactNode {
    if (row.credentialCount === 0) return <span className="text-(--ink-muted)">Not connected</span>;
    if (row.credentialCount === 1) return row.singleCredentialName;
    return `${row.credentialCount} credentials`;
}

function authMethodCell(row: ProviderRow): ReactNode {
    if (row.credentialCount === 0) return <span className="text-(--ink-muted)">—</span>;
    return row.authMethodLabel ?? <span className="text-(--ink-muted)">Mixed</span>;
}

function lastTestedCell(row: ProviderRow): ReactNode {
    if (!row.lastTestedAt) return <span className="text-(--ink-muted)">Never tested</span>;
    return formatDateTimeUTC(row.lastTestedAt);
}

function syncConfigCell(row: ProviderRow): ReactNode {
    if (row.syncConfigCount === 0) return <span className="text-(--ink-muted)">0</span>;
    return row.syncConfigCount;
}

function providerIdentity(row: ProviderRow): ReactNode {
    return (
        <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-(--card-70)">
                {row.icon}
            </div>
            <span className="truncate font-medium text-foreground">{row.name}</span>
        </div>
    );
}

const COLUMNS: DataTableColumn<ProviderRow>[] = [
    {
        key: "provider",
        header: "Provider",
        render: providerIdentity,
    },
    { key: "credential", header: "Credential", render: credentialCell },
    { key: "authMethod", header: "Auth method", render: authMethodCell },
    {
        key: "status",
        header: "Connection state",
        render: (row) => <ConnectionStatus status={row.status} />,
    },
    { key: "lastTested", header: "Last tested", render: lastTestedCell },
    { key: "syncConfigs", header: "Used by sync configs", render: syncConfigCell },
    {
        key: "actions",
        header: "Actions",
        render: (row) => (
            <Link
                href={`/org/admin/integrations/${row.id}`}
                className="rounded-md border border-(--card-stroke) px-3 py-1.5 text-xs font-medium text-foreground hover:bg-(--card-70)"
            >
                {CTA_LABELS.manageCredential}
            </Link>
        ),
    },
];

/**
 * Provider management table (CHAOS-2837): the integrations index renders one
 * row per provider — not an oversized card grid — so connection state, auth
 * method, last-verified time, and sync-config usage are scannable at a
 * glance. Row actions route to the provider's detail page, where the actual
 * credential management (add/test/resolve/delete) happens.
 */
export function ProviderTable({ providers }: ProviderTableProps) {
    return (
        <>
            <ul
                aria-label="Providers"
                className="space-y-3 lg:hidden"
                data-testid="provider-mobile-list"
            >
                {providers.map((provider) => (
                    <li
                        key={provider.id}
                        className="rounded-lg border border-(--card-stroke) bg-(--card-80) p-4"
                    >
                        <div className="flex min-w-0 items-center justify-between gap-3">
                            {providerIdentity(provider)}
                            <div className="shrink-0" data-testid="provider-mobile-status">
                                <ConnectionStatus status={provider.status} />
                            </div>
                        </div>
                        <Link
                            href={`/org/admin/integrations/${provider.id}`}
                            className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-(--card-stroke) px-3 py-1.5 text-xs font-medium text-foreground hover:bg-(--card-70)"
                        >
                            {CTA_LABELS.manageCredential}
                        </Link>
                    </li>
                ))}
            </ul>
            <div className="hidden lg:block">
                <DataTable
                    accessibleLabel="Providers"
                    columns={COLUMNS}
                    data={providers}
                    rowKeyAction={(row) => row.id}
                    emptyMessage="No providers configured yet."
                />
            </div>
        </>
    );
}
