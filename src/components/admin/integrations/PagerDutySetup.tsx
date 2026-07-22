"use client";

import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import type { IntegrationCredential } from "@/lib/admin/types";
import { CredentialsTable } from "./CredentialsTable";
import { PagerDutyCredentialForm } from "./PagerDutyCredentialForm";

type CredentialFlow =
    | { readonly kind: "add" }
    | { readonly kind: "reconnect"; readonly credential: IntegrationCredential }
    | null;

type PagerDutySetupProps = {
    readonly canCreatePagerDuty: boolean;
    readonly credentials?: readonly IntegrationCredential[];
    readonly syncConfigs?: readonly { credential_id: string | null }[];
};

export function PagerDutySetup({
    canCreatePagerDuty,
    credentials = [],
    syncConfigs = [],
}: PagerDutySetupProps) {
    const [credentialFlow, setCredentialFlow] = useState<CredentialFlow>(null);

    return (
        <section className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-h2 text-foreground">PagerDuty credentials</h2>
                    <p className="mt-1 text-body text-(--ink-muted)">
                        Add and manage the credentials that PagerDuty sync configurations use.
                    </p>
                </div>
                {canCreatePagerDuty ? (
                    <Button variant="primary" onClick={() => setCredentialFlow({ kind: "add" })}>
                        {CTA_LABELS.createCredential}
                    </Button>
                ) : null}
            </div>

            {!canCreatePagerDuty ? (
                <DataState
                    variant="detector-unavailable"
                    title="New PagerDuty connections are unavailable"
                    description="Existing credentials remain available for testing and cleanup."
                />
            ) : null}

            {credentials.length > 0 ? (
                <CredentialsTable
                    provider="pagerduty"
                    providerName="PagerDuty"
                    credentials={[...credentials]}
                    syncConfigs={[...syncConfigs]}
                    showManageAction={canCreatePagerDuty}
                    manageCredentialLabel={CTA_LABELS.reconnectPagerDuty}
                    onManageCredentialAction={(credential) =>
                        setCredentialFlow({ kind: "reconnect", credential })
                    }
                />
            ) : canCreatePagerDuty ? (
                <DataState
                    variant="no-data-connected"
                    title="No PagerDuty credentials"
                    description="Create a PagerDuty credential before configuring an operational sync."
                />
            ) : null}

            {credentialFlow ? (
                <PagerDutyCredentialForm
                    key={credentialFlow.kind === "reconnect" ? credentialFlow.credential.id : "add"}
                    credential={
                        credentialFlow.kind === "reconnect" ? credentialFlow.credential : undefined
                    }
                    credentials={credentials}
                    onCloseAction={() => setCredentialFlow(null)}
                />
            ) : null}
        </section>
    );
}
