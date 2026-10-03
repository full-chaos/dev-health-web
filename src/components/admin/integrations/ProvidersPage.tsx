"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { Button } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { ProviderTable, type ProviderRow } from "./ProviderTable";
import { AddProviderWizard } from "./wizard/AddProviderWizard";
import { CTA_LABELS } from "@/lib/design/cta";
import type { IntegrationCredential } from "@/lib/admin/types";

type ProvidersPageProps = {
    /** A load-failure notice for the credentials list (the page makes it; no raw backend text). */
    notice?: ReactNode;
    canCreatePagerDuty: boolean;
    providers: ProviderRow[];
    credentials: IntegrationCredential[];
};

/**
 * Providers index (CHAOS-2837): a provider management table plus the guided
 * Add Provider workflow entry point, replacing the oversized integration
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
    const [isWizardOpen, setIsWizardOpen] = useState(false);

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
            <AdminHeader
                title="Connections"
                description="Manage connections to external tools and services."
            >
                <Button
                    variant="primary"
                    onClick={() => setIsWizardOpen(true)}
                    icon={<Plus className="h-4 w-4" />}
                >
                    {CTA_LABELS.addProvider}
                </Button>
            </AdminHeader>
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
