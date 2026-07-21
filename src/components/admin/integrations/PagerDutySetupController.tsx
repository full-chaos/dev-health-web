"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { IntegrationCredential } from "@/lib/admin/types";
import {
    connectPagerDutyApiToken,
    connectPagerDutyClientCredentials,
    disconnectPagerDuty,
    getPagerDutyStatus,
    preflightPagerDuty,
    startPagerDutyOAuth,
} from "@/lib/admin/server";
import {
    PAGERDUTY_REGIONS,
    pagerDutyOAuthDatasets,
    type PagerDutyAuthMode,
    type PagerDutyPlannerDataset,
    type PagerDutyPreflightResponse,
    type PagerDutyStatusResponse,
} from "@/lib/admin/pagerduty";
import {
    PagerDutySetupDiagnostics,
    type PagerDutyDiagnosticError,
} from "./PagerDutySetupDiagnostics";
import { PagerDutySetupFields } from "./PagerDutySetupFields";
import { DataState } from "@/components/ui/DataState";

type PagerDutySetupProps = {
    readonly canCreatePagerDuty: boolean;
    readonly credentials?: readonly IntegrationCredential[];
};

export function PagerDutySetup({ canCreatePagerDuty, credentials = [] }: PagerDutySetupProps) {
    const canManagePagerDuty = canCreatePagerDuty || credentials.length > 0;
    const [credentialName, setCredentialName] = useState("default");
    const [authMode, setAuthMode] = useState<PagerDutyAuthMode>("oauth");
    const [clientId, setClientId] = useState("");
    const [clientSecret, setClientSecret] = useState("");
    const [apiToken, setApiToken] = useState("");
    const [subdomain, setSubdomain] = useState("");
    const [region, setRegion] = useState<(typeof PAGERDUTY_REGIONS)[number]>("us");
    const [datasets, setDatasets] = useState<readonly PagerDutyPlannerDataset[]>([
        "services",
        "incidents",
    ]);
    const [status, setStatus] = useState<PagerDutyStatusResponse | null>(null);
    const [preflight, setPreflight] = useState<PagerDutyPreflightResponse | null>(null);
    const [diagnosticError, setDiagnosticError] = useState<PagerDutyDiagnosticError | null>(null);
    const credentialGeneration = useRef(0);
    const statusCredentialGeneration = useRef<number | null>(null);
    const statusRequest = useRef(0);
    const preflightRequest = useRef(0);
    const [isPending, startTransition] = useTransition();

    function clearPreflightDiagnostics() {
        preflightRequest.current += 1;
        setPreflight(null);
        setDiagnosticError((current) => (current?.kind === "preflight" ? null : current));
    }

    function toggleDataset(dataset: PagerDutyPlannerDataset, checked: boolean) {
        clearPreflightDiagnostics();
        setDatasets((current) =>
            checked ? [...current, dataset] : current.filter((candidate) => candidate !== dataset),
        );
    }

    function changeRegion(value: string) {
        if (value === "us" || value === "eu") setRegion(value);
    }

    function changeCredentialName(value: string) {
        credentialGeneration.current += 1;
        statusRequest.current += 1;
        statusCredentialGeneration.current = null;
        clearPreflightDiagnostics();
        setStatus(null);
        setDiagnosticError(null);
        setCredentialName(value);
    }

    function changeAuthMode(value: PagerDutyAuthMode) {
        clearPreflightDiagnostics();
        setDiagnosticError(null);
        setAuthMode(value);
    }

    function connect() {
        if (!subdomain.trim() || datasets.length === 0) {
            const message = "Enter an account subdomain and choose at least one dataset.";
            setDiagnosticError({ kind: "oauth", message });
            toast.error(message);
            return;
        }
        setDiagnosticError(null);
        startTransition(async () => {
            const result = await startPagerDutyOAuth({
                credentialName: credentialName.trim() || "default",
                datasets: pagerDutyOAuthDatasets(datasets),
                region,
                subdomain: subdomain.trim(),
            });
            if (result.error) {
                setDiagnosticError({ kind: "oauth", message: result.error });
                toast.error(result.error);
                return;
            }
            if (!result.data) {
                const message = "PagerDuty authorization could not be started.";
                setDiagnosticError({ kind: "oauth", message });
                toast.error(message);
                return;
            }
            window.location.assign(result.data.authorize_url);
        });
    }

    async function loadStatus(
        name: string,
        expectedCredentialGeneration = credentialGeneration.current,
    ): Promise<boolean> {
        if (expectedCredentialGeneration !== credentialGeneration.current) return false;
        const request = ++statusRequest.current;
        clearPreflightDiagnostics();
        statusCredentialGeneration.current = null;
        setStatus(null);
        setDiagnosticError(null);
        const result = await getPagerDutyStatus(name);
        if (
            request !== statusRequest.current ||
            expectedCredentialGeneration !== credentialGeneration.current
        ) {
            return false;
        }
        if (result.error) {
            setDiagnosticError({ kind: "status", message: result.error });
            toast.error(result.error);
            return false;
        }
        if (!result.data) {
            const message = "PagerDuty status is unavailable.";
            setDiagnosticError({ kind: "status", message });
            toast.error(message);
            return false;
        }
        setStatus(result.data);
        setDiagnosticError(null);
        statusCredentialGeneration.current = expectedCredentialGeneration;
        return true;
    }

    function saveManualCredential() {
        if (
            !subdomain.trim() ||
            (authMode === "client_credentials" ? !clientId.trim() || !clientSecret : !apiToken)
        ) {
            const message = "Complete the required PagerDuty credential fields.";
            setDiagnosticError({ kind: "credential", message });
            toast.error(message);
            return;
        }
        const name = credentialName.trim() || "default";
        const expectedCredentialGeneration = credentialGeneration.current;
        setDiagnosticError(null);
        startTransition(async () => {
            const saved =
                authMode === "client_credentials"
                    ? await connectPagerDutyClientCredentials({
                          credentialName: name,
                          clientId: clientId.trim(),
                          clientSecret,
                          subdomain: subdomain.trim(),
                          region,
                      })
                    : await connectPagerDutyApiToken({
                          credentialName: name,
                          apiToken,
                          subdomain: subdomain.trim(),
                          region,
                      });
            if (expectedCredentialGeneration !== credentialGeneration.current) return;
            if (saved.error || !saved.data) {
                const message = saved.error ?? "PagerDuty credential could not be saved.";
                setDiagnosticError({ kind: "credential", message });
                toast.error(message);
                return;
            }
            setClientSecret("");
            setApiToken("");
            toast.success("PagerDuty credential saved.");
            await loadStatus(name, expectedCredentialGeneration);
        });
    }

    function refreshStatus() {
        const name = credentialName.trim() || "default";
        const expectedCredentialGeneration = credentialGeneration.current;
        startTransition(async () => {
            await loadStatus(name, expectedCredentialGeneration);
        });
    }

    function runPreflight() {
        if (statusCredentialGeneration.current !== credentialGeneration.current || !status) return;
        const request = ++preflightRequest.current;
        const selectedDatasets = pagerDutyOAuthDatasets(datasets);
        setPreflight(null);
        setDiagnosticError(null);
        startTransition(async () => {
            const result = await preflightPagerDuty(status.credential_name, selectedDatasets);
            if (request !== preflightRequest.current) return;
            if (result.error) {
                setDiagnosticError({ kind: "preflight", message: result.error });
                toast.error(result.error);
                return;
            }
            if (!result.data) {
                const message = "PagerDuty preflight is unavailable.";
                setDiagnosticError({ kind: "preflight", message });
                toast.error(message);
                return;
            }
            setPreflight(result.data);
            setDiagnosticError(null);
            const missing = result.data.datasets.filter((dataset) => !dataset.granted);
            toast[missing.length > 0 ? "warning" : "success"](
                missing.length > 0
                    ? "Some selected datasets need additional PagerDuty permissions."
                    : "PagerDuty permissions are ready for the selected datasets.",
            );
        });
    }

    function disconnect() {
        if (statusCredentialGeneration.current !== credentialGeneration.current || !status) return;
        setDiagnosticError(null);
        startTransition(async () => {
            const result = await disconnectPagerDuty(status.credential_name);
            if (result.error) {
                setDiagnosticError({ kind: "disconnect", message: result.error });
                toast.error(result.error);
                return;
            }
            setStatus(null);
            setDiagnosticError(null);
            clearPreflightDiagnostics();
            toast.success("PagerDuty disconnected.");
        });
    }

    return (
        <section className="space-y-6 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
            <div>
                <h2 className="text-h2 text-foreground">
                    {canCreatePagerDuty ? "Connect PagerDuty" : "Manage PagerDuty"}
                </h2>
                <p className="mt-1 text-body text-(--ink-muted)">
                    {canCreatePagerDuty
                        ? "Connect with read-only OAuth. Dev Health never asks you to paste a hosted OAuth token."
                        : "Review connection status or remove an existing PagerDuty credential."}
                </p>
            </div>
            {!canCreatePagerDuty && credentials.length === 0 ? (
                <DataState
                    variant="no-data-connected"
                    title="PagerDuty setup is unavailable"
                    description="New PagerDuty connections are unavailable for this organization."
                />
            ) : null}
            {!canCreatePagerDuty && credentials.length > 0 ? (
                <DataState
                    variant="detector-unavailable"
                    title="PagerDuty setup is unavailable"
                    description="New PagerDuty connections are unavailable. Existing credentials remain available for status checks and removal."
                />
            ) : null}
            {canManagePagerDuty ? (
                <>
                    <PagerDutySetupFields
                        canCreatePagerDuty={canCreatePagerDuty}
                        credentials={credentials}
                        credentialName={credentialName}
                        authMode={authMode}
                        clientId={clientId}
                        clientSecret={clientSecret}
                        apiToken={apiToken}
                        subdomain={subdomain}
                        region={region}
                        datasets={datasets}
                        onCredentialNameChangeAction={changeCredentialName}
                        onAuthModeChangeAction={changeAuthMode}
                        onClientIdChangeAction={setClientId}
                        onClientSecretChangeAction={setClientSecret}
                        onApiTokenChangeAction={setApiToken}
                        onSubdomainChangeAction={setSubdomain}
                        onRegionChangeAction={changeRegion}
                        onDatasetChangeAction={toggleDataset}
                    />
                    <PagerDutySetupDiagnostics
                        authMode={authMode}
                        canCreatePagerDuty={canCreatePagerDuty}
                        status={status}
                        preflight={preflight}
                        error={diagnosticError}
                        isPending={isPending}
                        onConnectAction={connect}
                        onSaveManualCredentialAction={saveManualCredential}
                        onRefreshStatusAction={refreshStatus}
                        onRunPreflightAction={runPreflight}
                        onDisconnectAction={disconnect}
                    />
                </>
            ) : null}
        </section>
    );
}
