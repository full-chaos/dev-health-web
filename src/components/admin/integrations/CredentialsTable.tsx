"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ConnectionStatus } from "./ConnectionStatus";
import { EditCredentialModal } from "./EditCredentialModal";
import { deriveCredentialStatus } from "./credentialStatus";
import { getAuthMethodLabel, isGitHubAppCredential } from "./authMethod";
import { testConnection, deleteCredential } from "@/lib/admin/server";
import { formatDateTimeUTC } from "@/lib/formatters";
import { CTA_LABELS } from "@/lib/design/cta";
import type { IntegrationCredential, Provider } from "@/lib/admin/types";

type CredentialsTableProps = {
    provider: Provider;
    providerName: string;
    credentials: IntegrationCredential[];
    syncConfigs: { credential_id: string | null }[];
};

/**
 * Compact per-provider credentials table (CHAOS-2837): replaces the
 * oversized `CredentialCard` grid with scannable rows and row-level actions
 * (Manage / Resolve / Test / Delete), matching the admin surface's other
 * `DataTable`-based lists.
 */
export function CredentialsTable({
    provider,
    providerName,
    credentials,
    syncConfigs,
}: CredentialsTableProps) {
    const [testingId, setTestingId] = useState<string | null>(null);
    const [isTesting, startTesting] = useTransition();
    const [managing, setManaging] = useState<IntegrationCredential | null>(null);
    const [deleting, setDeleting] = useState<IntegrationCredential | null>(null);
    const [isDeleting, startDeleting] = useTransition();

    const usedByCount = (credentialId: string) =>
        syncConfigs.filter((sc) => sc.credential_id === credentialId).length;

    const handleTest = (credential: IntegrationCredential) => {
        setTestingId(credential.id);
        startTesting(async () => {
            const result = await testConnection(credential.provider, { name: credential.name });
            if (result.error || !result.data?.success) {
                toast.error(result.error ?? result.data?.error ?? "Connection test failed");
            } else {
                toast.success("Connection successful");
            }
            setTestingId(null);
        });
    };

    const handleDelete = () => {
        if (!deleting) return;
        startDeleting(async () => {
            const result = await deleteCredential(deleting.provider, deleting.name);
            if (result.error) {
                toast.error(result.error);
                return;
            }
            toast.success("Credential deleted");
            setDeleting(null);
        });
    };

    const columns: DataTableColumn<IntegrationCredential>[] = [
        {
            key: "name",
            header: "Name",
            render: (row) => <span className="font-medium">{row.name}</span>,
        },
        {
            key: "authMethod",
            header: "Auth method",
            render: (row) => getAuthMethodLabel(provider, row),
        },
        {
            key: "status",
            header: "Status",
            render: (row) => <ConnectionStatus status={deriveCredentialStatus(row)} />,
        },
        {
            key: "lastTested",
            header: "Last tested",
            render: (row) =>
                row.last_test_at ? (
                    formatDateTimeUTC(row.last_test_at)
                ) : (
                    <span className="text-(--ink-muted)">Never tested</span>
                ),
        },
        {
            key: "usedBy",
            header: "Used by sync configs",
            render: (row) => usedByCount(row.id),
        },
        {
            key: "actions",
            header: "Actions",
            render: (row) => {
                const status = deriveCredentialStatus(row);
                const needsResolution = status === "failing" || status === "untested";
                const manageLabel = needsResolution
                    ? CTA_LABELS.resolveCredential
                    : CTA_LABELS.manageCredential;
                const isGitHubApp = isGitHubAppCredential(row);
                return (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => handleTest(row)}
                            disabled={isTesting && testingId === row.id}
                            className="rounded-md border border-(--card-stroke) px-2.5 py-1 text-xs font-medium text-foreground hover:bg-(--card-70) disabled:opacity-50"
                        >
                            {isTesting && testingId === row.id
                                ? "Testing…"
                                : CTA_LABELS.testCredential}
                        </button>
                        {!isGitHubApp && (
                            <button
                                type="button"
                                onClick={() => setManaging(row)}
                                className="rounded-md border border-(--card-stroke) px-2.5 py-1 text-xs font-medium text-foreground hover:bg-(--card-70)"
                            >
                                {manageLabel}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setDeleting(row)}
                            className="rounded-md border border-(--negative)/30 px-2.5 py-1 text-xs font-medium text-(--negative) hover:bg-(--negative)/10"
                        >
                            {CTA_LABELS.delete}
                        </button>
                    </div>
                );
            },
        },
    ];

    return (
        <>
            <DataTable
                columns={columns}
                data={credentials}
                rowKeyAction={(row) => row.id}
                emptyMessage={`No ${providerName} credentials yet.`}
            />

            <EditCredentialModal
                isOpen={managing !== null}
                existingCredential={managing}
                provider={provider}
                onCloseAction={() => setManaging(null)}
                onEditedAction={() => setManaging(null)}
            />

            <ConfirmDialog
                isOpen={deleting !== null}
                title="Delete credential"
                description={
                    deleting && usedByCount(deleting.id) > 0
                        ? `"${deleting.name}" is used by ${usedByCount(deleting.id)} sync configuration${usedByCount(deleting.id) === 1 ? "" : "s"}. Deleting it will disconnect ${providerName} for those configurations.`
                        : `Are you sure you want to delete "${deleting?.name}"?`
                }
                tone="destructive"
                isPending={isDeleting}
                onConfirmAction={handleDelete}
                onCancelAction={() => setDeleting(null)}
            />
        </>
    );
}
