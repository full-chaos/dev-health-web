"use client";

import { useState } from "react";
import { CredentialCard } from "./CredentialCard";
import { IntegrationFormWrapper } from "@/app/(app)/admin/integrations/[provider]/IntegrationFormWrapper";
import type { IntegrationCredential, Provider } from "@/lib/admin/types";
import type { ConnectionStatusType } from "@/components/admin/integrations/ConnectionStatus";

type ProviderCredentialsListProps = {
    provider: Provider;
    providerName: string;
    credentials: IntegrationCredential[];
    syncConfigs: { credential_id: string | null }[];
};

function getStatus(credential: IntegrationCredential | undefined): ConnectionStatusType {
    if (!credential) return "not_configured";
    if (credential.last_test_success === true) return "connected";
    if (credential.last_test_success === false) return "error";
    return "connected";
}

export function ProviderCredentialsList({
    provider,
    providerName,
    credentials,
    syncConfigs,
}: ProviderCredentialsListProps) {
    // Auto-open the form for first-time setup so users (and e2e tests) immediately
    // see the credential fields instead of an empty state requiring an extra click.
    const [isFormOpen, setIsFormOpen] = useState(credentials.length === 0);
    const [editingCredential, setEditingCredential] = useState<IntegrationCredential | undefined>(
        undefined,
    );

    const handleAddConnection = () => {
        setEditingCredential(undefined);
        setIsFormOpen(true);
    };

    const handleEdit = (cred: IntegrationCredential) => {
        setEditingCredential(cred);
        setIsFormOpen(true);
    };

    const handleCancel = () => {
        setIsFormOpen(false);
        setEditingCredential(undefined);
    };

    const handleSuccess = () => {
        setIsFormOpen(false);
        setEditingCredential(undefined);
    };

    if (isFormOpen) {
        return (
            <IntegrationFormWrapper
                provider={provider}
                providerName={providerName}
                initialStatus={getStatus(editingCredential)}
                existingCredential={editingCredential}
                onCancel={handleCancel}
                onSuccess={handleSuccess}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-(--ink-base)">Saved Credentials</h2>
                <button
                    type="button"
                    onClick={handleAddConnection}
                    className="inline-flex items-center justify-center rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90"
                >
                    Add Connection
                </button>
            </div>

            {credentials.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-(--border-subtle) bg-(--surface-base) py-12 text-center">
                    <h3 className="mb-2 text-lg font-medium text-(--ink-base)">
                        No credentials saved
                    </h3>
                    <p className="mb-6 text-sm text-(--ink-muted)">
                        Connect your first {providerName} account to get started.
                    </p>
                    <button
                        type="button"
                        onClick={handleAddConnection}
                        className="inline-flex items-center justify-center rounded-md bg-(--surface-inverted) px-4 py-2 text-sm font-medium text-(--ink-inverted) hover:bg-(--surface-inverted)/90"
                    >
                        Add Connection
                    </button>
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {credentials.map((cred) => {
                        const isUsed = syncConfigs.some((sc) => sc.credential_id === cred.id);
                        return (
                            <CredentialCard
                                key={cred.id}
                                credential={cred}
                                providerName={providerName}
                                isUsedBySyncConfigs={isUsed}
                                onEdit={() => handleEdit(cred)}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}
