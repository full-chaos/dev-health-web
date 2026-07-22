"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CredentialsTable } from "./CredentialsTable";
import { AddProviderWizard } from "./wizard/AddProviderWizard";
import { CTA_LABELS } from "@/lib/design/cta";
import type { IntegrationCredential, Provider } from "@/lib/admin/types";

type ProviderCredentialsListProps = {
    provider: Provider;
    providerName: string;
    credentials: IntegrationCredential[];
    syncConfigs: { credential_id: string | null }[];
    canCreateCredential?: boolean;
};

/**
 * Per-provider credential management surface (CHAOS-2837): a compact table
 * (`CredentialsTable`) plus the guided Add Provider wizard, replacing the
 * oversized credential-card grid and the flat, always-mounted create/edit
 * form. Auto-opens the wizard on first-time setup (zero credentials) so
 * the guided flow is immediately visible, matching the prior auto-open
 * behavior for an empty provider.
 */
export function ProviderCredentialsList({
    provider,
    providerName,
    credentials,
    syncConfigs,
    canCreateCredential = true,
}: ProviderCredentialsListProps) {
    const router = useRouter();
    const [isWizardOpen, setIsWizardOpen] = useState(
        credentials.length === 0 && canCreateCredential,
    );

    const handleCreated = () => {
        router.refresh();
    };

    if (isWizardOpen) {
        return (
            <AddProviderWizard
                canCreatePagerDuty={canCreateCredential}
                lockedProvider={provider}
                credentials={credentials}
                onCloseAction={() => setIsWizardOpen(false)}
                onCreatedAction={handleCreated}
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Credentials</h2>
                {canCreateCredential ? (
                    <button
                        type="button"
                        onClick={() => setIsWizardOpen(true)}
                        className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
                    >
                        {CTA_LABELS.addCredential}
                    </button>
                ) : null}
            </div>

            {credentials.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-(--card-stroke) py-12 text-center">
                    <p className="mb-4 text-sm text-(--ink-muted)">
                        No {providerName} credentials yet.
                    </p>
                    {canCreateCredential ? (
                        <button
                            type="button"
                            onClick={() => setIsWizardOpen(true)}
                            className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
                        >
                            {CTA_LABELS.addCredential}
                        </button>
                    ) : null}
                </div>
            ) : (
                <CredentialsTable
                    provider={provider}
                    providerName={providerName}
                    credentials={credentials}
                    syncConfigs={syncConfigs}
                />
            )}
        </div>
    );
}
