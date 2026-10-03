"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Section } from "@/components/ui/Section";
import { ProviderTable, type ProviderRow } from "./ProviderTable";
import { AddProviderWizard } from "./wizard/AddProviderWizard";
import { useProvidersWizard } from "./ProvidersWizardContext";
import type { IntegrationCredential } from "@/lib/admin/types";

type ProvidersPageProps = {
    /** A load-failure notice for the credentials list (the page makes it; no raw backend text). */
    notice?: ReactNode;
    canCreatePagerDuty: boolean;
    providers: ProviderRow[];
    credentials: IntegrationCredential[];
};

/**
 * Providers index body (CHAOS-2837): a provider management table; the guided
 * Add Provider workflow (opened from the header action, `AddProviderButton`), replacing the oversized integration
 * card grid. The provider isn't locked here — the wizard's first step lets
 * the user choose which provider to connect.
 */
export function ProvidersPage({
    notice,
    canCreatePagerDuty,
    providers,
    credentials,
}: ProvidersPageProps) {
    const router = useRouter();
    const { isOpen: isWizardOpen, setOpen: setIsWizardOpen } = useProvidersWizard();

    if (isWizardOpen) {
        return (
            <AddProviderWizard
                canCreatePagerDuty={canCreatePagerDuty}
                credentials={credentials}
                onCloseAction={() => setIsWizardOpen(false)}
                onCreatedAction={() => router.refresh()}
            />
        );
    }

    return (
        <div className="space-y-6">
            {notice}
            <Section title="Providers">
                <ProviderTable
                    providers={
                        canCreatePagerDuty
                            ? providers
                            : providers.filter(
                                  (provider) =>
                                      provider.id !== "pagerduty" ||
                                      provider.credentialCount > 0 ||
                                      provider.syncConfigCount > 0,
                              )
                    }
                />
            </Section>
        </div>
    );
}
