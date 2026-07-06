"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProviderTable, type ProviderRow } from "./ProviderTable";
import { AddProviderWizard } from "./wizard/AddProviderWizard";
import { CTA_LABELS } from "@/lib/design/cta";
import type { IntegrationCredential } from "@/lib/admin/types";

type ProvidersPageProps = {
    providers: ProviderRow[];
    credentials: IntegrationCredential[];
};

/**
 * Providers index (CHAOS-2837): a provider management table plus the guided
 * Add Provider workflow entry point, replacing the oversized integration
 * card grid. The provider isn't locked here — the wizard's first step lets
 * the user choose which provider to connect.
 */
export function ProvidersPage({ providers, credentials }: ProvidersPageProps) {
    const router = useRouter();
    const [isWizardOpen, setIsWizardOpen] = useState(false);

    if (isWizardOpen) {
        return (
            <AddProviderWizard
                credentials={credentials}
                onCloseAction={() => setIsWizardOpen(false)}
                onCreatedAction={() => router.refresh()}
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={() => setIsWizardOpen(true)}
                    className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
                >
                    {CTA_LABELS.addProvider}
                </button>
            </div>
            <ProviderTable providers={providers} />
        </div>
    );
}
