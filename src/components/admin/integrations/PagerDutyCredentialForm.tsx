"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/shared/Button";
import { DataState } from "@/components/ui/DataState";
import {
    connectPagerDutyApiToken,
    connectPagerDutyClientCredentials,
    startPagerDutyOAuth,
} from "@/lib/admin/server";
import {
    PAGERDUTY_PLANNER_DATASETS,
    PAGERDUTY_REGIONS,
    pagerDutyOAuthDatasets,
    type PagerDutyAuthMode,
    type PagerDutyRegion,
} from "@/lib/admin/pagerduty";
import { CTA_LABELS } from "@/lib/design/cta";
import type { IntegrationCredential } from "@/lib/admin/types";
import { pagerDutySyncConfigPath } from "@/lib/admin/syncConfigPreselection";

type PagerDutyCredentialFormProps = {
    readonly credential?: IntegrationCredential;
    readonly credentials: readonly IntegrationCredential[];
    readonly onCloseAction: () => void;
};

type FormError = { readonly message: string } | null;

export function PagerDutyCredentialForm({
    credential,
    credentials,
    onCloseAction,
}: PagerDutyCredentialFormProps) {
    const router = useRouter();
    const [authMode, setAuthMode] = useState<PagerDutyAuthMode>("oauth");
    const [credentialName, setCredentialName] = useState(credential?.name ?? "");
    const [subdomain, setSubdomain] = useState("");
    const [region, setRegion] = useState<PagerDutyRegion>("us");
    const [clientId, setClientId] = useState("");
    const [clientSecret, setClientSecret] = useState("");
    const [apiToken, setApiToken] = useState("");
    const [error, setError] = useState<FormError>(null);
    const [isPending, startTransition] = useTransition();
    const requestGeneration = useRef(0);

    const isReconnect = credential !== undefined;

    function changeCredentialName(value: string) {
        requestGeneration.current += 1;
        setCredentialName(value);
        setError(null);
    }

    function changeRegion(value: string) {
        if (value === "us" || value === "eu") setRegion(value);
    }

    function validateName(): string | null {
        const name = credentialName.trim();
        if (!name) return "Enter a credential name.";
        if (!isReconnect && credentials.some((candidate) => candidate.name === name)) {
            return "A credential with this name already exists. Use Reconnect / rotate for that credential.";
        }
        return null;
    }

    function validateConnection(): string | null {
        const nameError = validateName();
        if (nameError) return nameError;
        if (!subdomain.trim()) return "Enter an account subdomain.";
        if (authMode === "client_credentials" && (!clientId.trim() || !clientSecret)) {
            return "Enter the client ID and client secret.";
        }
        if (authMode === "api_token" && !apiToken) return "Enter an API token.";
        return null;
    }

    function reportValidationError(message: string) {
        setError({ message });
        toast.error(message);
    }

    function startOAuth() {
        const validationError = validateConnection();
        if (validationError) {
            reportValidationError(validationError);
            return;
        }
        const generation = requestGeneration.current;
        startTransition(async () => {
            const result = await startPagerDutyOAuth({
                credentialName: credentialName.trim(),
                datasets: pagerDutyOAuthDatasets(PAGERDUTY_PLANNER_DATASETS),
                region,
                subdomain: subdomain.trim(),
            });
            if (generation !== requestGeneration.current) return;
            if (result.error || !result.data) {
                reportValidationError(
                    result.error ?? "PagerDuty authorization could not be started.",
                );
                return;
            }
            window.location.assign(result.data.authorize_url);
        });
    }

    function saveManualCredential() {
        const validationError = validateConnection();
        if (validationError) {
            reportValidationError(validationError);
            return;
        }
        const generation = requestGeneration.current;
        startTransition(async () => {
            const result =
                authMode === "client_credentials"
                    ? await connectPagerDutyClientCredentials({
                          credentialName: credentialName.trim(),
                          clientId: clientId.trim(),
                          clientSecret,
                          region,
                          subdomain: subdomain.trim(),
                      })
                    : await connectPagerDutyApiToken({
                          credentialName: credentialName.trim(),
                          apiToken,
                          region,
                          subdomain: subdomain.trim(),
                      });
            if (generation !== requestGeneration.current) return;
            if (result.error || !result.data) {
                reportValidationError(result.error ?? "PagerDuty credential could not be saved.");
                return;
            }
            setClientSecret("");
            setApiToken("");
            router.push(pagerDutySyncConfigPath(result.data.credential_name));
        });
    }

    const submitAction = authMode === "oauth" ? startOAuth : saveManualCredential;

    return (
        <section className="space-y-4 rounded-lg border border-(--card-stroke) bg-(--card-80) p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-h3 text-foreground">
                        {isReconnect
                            ? `Reconnect ${credential.name}`
                            : "Create PagerDuty credential"}
                    </h3>
                    <p className="mt-1 text-body text-(--ink-muted)">
                        Choose an authentication method. Sync targets and mappings are configured in
                        Sync Status.
                    </p>
                </div>
                <Button variant="ghost" onClick={onCloseAction}>
                    {CTA_LABELS.cancel}
                </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-foreground">
                    Credential name
                    <input
                        value={credentialName}
                        onChange={(event) => changeCredentialName(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                    />
                </label>
                <label className="text-sm font-medium text-foreground">
                    Account subdomain
                    <input
                        value={subdomain}
                        onChange={(event) => setSubdomain(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                    />
                </label>
                <label className="text-sm font-medium text-foreground">
                    Region
                    <select
                        value={region}
                        onChange={(event) => changeRegion(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                    >
                        {PAGERDUTY_REGIONS.map((option) => (
                            <option key={option} value={option}>
                                {option.toUpperCase()}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-foreground">
                    Authentication method
                </legend>
                <div className="flex flex-wrap gap-2">
                    {(["oauth", "client_credentials", "api_token"] as const).map((mode) => (
                        <Button
                            key={mode}
                            variant={authMode === mode ? "primary" : "secondary"}
                            aria-pressed={authMode === mode}
                            onClick={() => {
                                setAuthMode(mode);
                                setError(null);
                            }}
                        >
                            {mode === "oauth"
                                ? "OAuth (recommended)"
                                : mode === "client_credentials"
                                  ? "Client credentials"
                                  : "Use API token instead"}
                        </Button>
                    ))}
                </div>
                {authMode === "client_credentials" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-medium text-foreground">
                            Client ID
                            <input
                                value={clientId}
                                onChange={(event) => setClientId(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                            />
                        </label>
                        <label className="text-sm font-medium text-foreground">
                            Client secret
                            <input
                                type="password"
                                value={clientSecret}
                                onChange={(event) => setClientSecret(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                            />
                        </label>
                    </div>
                ) : null}
                {authMode === "api_token" ? (
                    <label className="block text-sm font-medium text-foreground">
                        API token
                        <input
                            type="password"
                            value={apiToken}
                            onChange={(event) => setApiToken(event.target.value)}
                            className="mt-1 w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2"
                        />
                    </label>
                ) : null}
            </fieldset>

            {error ? <DataState variant="error" message={error.message} /> : null}

            <Button variant="primary" disabled={isPending} onClick={submitAction}>
                {authMode === "oauth" ? CTA_LABELS.connectPagerDuty : CTA_LABELS.save}
            </Button>
        </section>
    );
}
