"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CTA_LABELS } from "@/lib/design/cta";
import { AddProviderStepProgress } from "./AddProviderStepProgress";
import { StepNav } from "@/components/admin/sync/config-form/StepNav";
import { createCredential, testConnection } from "@/lib/admin/server";
import { PROVIDER_LABELS, type IntegrationCredential, type Provider } from "@/lib/admin/types";
import { hasConnectedGitHubApp, getManualAuthMethodLabel } from "../authMethod";
import {
    getAddProviderStepBlockReason,
    getVisibleAddProviderSteps,
    isRedirectMethod,
    providerHasAuthMethodChoice,
    type AddProviderMethod,
} from "../addProviderWizardSteps";
import { hasPrimaryCredentialField } from "./providerRequiredFields";
import { ProviderSelectStep } from "./ProviderSelectStep";
import { AuthMethodStep } from "./AuthMethodStep";
import { CredentialEntryStep } from "./CredentialEntryStep";
import { VerifyConnectionStep } from "./VerifyConnectionStep";
import { FinishStep } from "./FinishStep";

type AddProviderWizardProps = {
    /** Set when launched from a specific provider's detail page — skips the provider-select step. */
    lockedProvider?: Provider;
    /** All credentials, used only to detect an existing GitHub App connection. */
    credentials: IntegrationCredential[];
    onCloseAction: () => void;
    /** Fired once the credential is actually persisted. */
    onCreatedAction: () => void;
};

function initialMethod(provider: Provider | "", hasGitHubApp: boolean): AddProviderMethod | null {
    if (!provider) return null;
    return providerHasAuthMethodChoice(provider, hasGitHubApp) ? null : "manual";
}

/**
 * Guided Add Provider workflow (CHAOS-2837): provider \u2192 auth method \u2192
 * credential \u2192 verify \u2192 review, orchestrated the same way
 * `CreateSyncConfigWizard` orchestrates the sync-config creation flow \u2014
 * a pure step model (`addProviderWizardSteps.ts`) decides visibility/gating,
 * this component only wires state to it and to the existing credential
 * server actions.
 */
export function AddProviderWizard({
    lockedProvider,
    credentials,
    onCloseAction,
    onCreatedAction,
}: AddProviderWizardProps) {
    const hasGitHubApp = useMemo(() => hasConnectedGitHubApp(credentials), [credentials]);
    const [provider, setProvider] = useState<Provider | "">(lockedProvider ?? "");
    const [method, setMethod] = useState<AddProviderMethod | null>(
        initialMethod(lockedProvider ?? "", hasGitHubApp),
    );
    const [credentialName, setCredentialName] = useState("");
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
    const [verified, setVerified] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(
        null,
    );
    const [submitted, setSubmitted] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPending, startPending] = useTransition();

    const visibleSteps = useMemo(
        () =>
            getVisibleAddProviderSteps(provider || "github", hasGitHubApp, Boolean(lockedProvider)),
        [provider, hasGitHubApp, lockedProvider],
    );
    const clampedIndex = Math.min(currentIndex, visibleSteps.length - 1);
    const currentStep = visibleSteps[clampedIndex];
    const resolvedProvider = (provider || "github") as Provider;
    const redirect = isRedirectMethod(method);

    const blockReason = getAddProviderStepBlockReason(currentStep.id, {
        provider,
        method,
        credentialName,
        credentialFieldsComplete: hasPrimaryCredentialField(resolvedProvider, fieldValues),
        verified,
    });

    function goToStep(index: number) {
        if (index <= clampedIndex) setCurrentIndex(index);
    }
    function goNext() {
        if (blockReason) return;
        setCurrentIndex((i) => Math.min(i + 1, visibleSteps.length - 1));
    }
    function goBack() {
        setCurrentIndex((i) => Math.max(i - 1, 0));
    }

    function handleProviderChange(next: Provider) {
        setProvider(next);
        setMethod(initialMethod(next, next === "github" ? hasGitHubApp : false));
        setFieldValues({});
    }
    function handleMethodChange(next: AddProviderMethod) {
        setMethod(next);
        setFieldValues({});
    }
    function handleFieldChange(name: string, value: string) {
        setFieldValues((prev) => ({ ...prev, [name]: value }));
    }

    function handleVerify() {
        startPending(async () => {
            const result = await testConnection(resolvedProvider, {
                name: credentialName || "default",
                credentials: fieldValues,
            });
            if (result.error || !result.data?.success) {
                setVerified(false);
                setTestResult({
                    success: false,
                    message: result.error ?? result.data?.error ?? "Connection test failed",
                });
                return;
            }
            setVerified(true);
            setTestResult({ success: true, message: "Connection successful" });
        });
    }

    function handleFinish() {
        startPending(async () => {
            const result = await createCredential({
                provider: resolvedProvider,
                name: credentialName || "default",
                credentials: fieldValues,
            });
            if (result.error) {
                toast.error(result.error);
                return;
            }
            setSubmitted(true);
            onCreatedAction();
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <AddProviderStepProgress
                    steps={visibleSteps}
                    currentIndex={clampedIndex}
                    onStepClickAction={goToStep}
                />
                <button
                    type="button"
                    onClick={onCloseAction}
                    className="shrink-0 text-sm font-medium text-(--ink-muted) hover:text-foreground"
                >
                    {CTA_LABELS.cancel}
                </button>
            </div>

            <div className="space-y-6 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
                {currentStep.id === "provider" && (
                    <ProviderSelectStep provider={provider} onChangeAction={handleProviderChange} />
                )}
                {currentStep.id === "method" && (
                    <AuthMethodStep method={method} onChooseAction={handleMethodChange} />
                )}
                {currentStep.id === "credential" && (
                    <CredentialEntryStep
                        provider={resolvedProvider}
                        method={method}
                        credentialName={credentialName}
                        onCredentialNameChangeAction={setCredentialName}
                        onFieldChangeAction={handleFieldChange}
                    />
                )}
                {currentStep.id === "verify" && (
                    <VerifyConnectionStep
                        isRedirect={redirect}
                        isPending={isPending}
                        testResult={testResult}
                        onVerifyAction={handleVerify}
                    />
                )}
                {currentStep.id === "review" && (
                    <FinishStep
                        providerLabel={PROVIDER_LABELS[resolvedProvider]}
                        credentialName={credentialName}
                        authMethodLabel={
                            redirect ? "GitHub App" : getManualAuthMethodLabel(resolvedProvider)
                        }
                        isRedirect={redirect}
                        isPending={isPending}
                        submitted={submitted}
                        onBackAction={goBack}
                        onFinishAction={handleFinish}
                        onDoneAction={onCloseAction}
                    />
                )}
            </div>

            {currentStep.id !== "review" && (
                <StepNav
                    onBackAction={clampedIndex > 0 ? goBack : undefined}
                    onContinueAction={goNext}
                    blockReason={blockReason}
                />
            )}
        </div>
    );
}
