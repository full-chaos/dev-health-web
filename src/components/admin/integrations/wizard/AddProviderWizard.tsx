"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CTA_LABELS } from "@/lib/design/cta";
import { AddProviderStepProgress } from "./AddProviderStepProgress";
import { StepNav } from "@/components/admin/sync/config-form/StepNav";
import { testConnection } from "@/lib/admin/server";
import { PROVIDER_LABELS, type IntegrationCredential, type Provider } from "@/lib/admin/types";
import { hasGitHubAppCredential, getManualAuthMethodLabel } from "../authMethod";
import { saveAddProviderCredential } from "../credentialPersistence";
import { startPagerDutyOAuthCredential } from "../pagerDutyCredentialActions";
import {
    getAddProviderStepBlockReason,
    getVisibleAddProviderSteps,
    isRedirectMethod,
    providerHasAuthMethodChoice,
    type AddProviderMethod,
} from "../addProviderWizardSteps";
import { hasPrimaryCredentialField } from "./providerRequiredFields";
import { fingerprintVerificationInputs } from "./verificationFingerprint";
import { ProviderSelectStep } from "./ProviderSelectStep";
import { AuthMethodStep } from "./AuthMethodStep";
import { CredentialEntryStep } from "./CredentialEntryStep";
import { VerifyConnectionStep } from "./VerifyConnectionStep";
import { FinishStep } from "./FinishStep";

type AddProviderWizardProps = {
    canCreatePagerDuty?: boolean;
    lockedProvider?: Provider;
    credentials: IntegrationCredential[];
    onCloseAction: () => void;
    onCreatedAction: () => void;
};

type TestResult = {
    fingerprint: string;
    success: boolean;
    message: string;
};

function initialMethod(provider: Provider | "", hasGitHubApp: boolean): AddProviderMethod | null {
    if (!provider) return null;
    if (provider === "pagerduty") return null;
    return providerHasAuthMethodChoice(provider, hasGitHubApp) ? null : "manual";
}

export function AddProviderWizard({
    canCreatePagerDuty = false,
    lockedProvider,
    credentials,
    onCloseAction,
    onCreatedAction,
}: AddProviderWizardProps) {
    const hasGitHubApp = useMemo(() => hasGitHubAppCredential(credentials), [credentials]);
    const [provider, setProvider] = useState<Provider | "">(lockedProvider ?? "");
    const [method, setMethod] = useState<AddProviderMethod | null>(
        initialMethod(lockedProvider ?? "", hasGitHubApp),
    );
    const [credentialName, setCredentialName] = useState("");
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [submitted, setSubmitted] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPending, startPending] = useTransition();

    const visibleSteps = useMemo(
        () =>
            getVisibleAddProviderSteps(
                provider || "github",
                hasGitHubApp,
                Boolean(lockedProvider),
                method,
            ),
        [provider, hasGitHubApp, lockedProvider, method],
    );
    const clampedIndex = Math.min(currentIndex, visibleSteps.length - 1);
    const currentStep = visibleSteps[clampedIndex];
    const resolvedProvider = (provider || "github") as Provider;
    const redirect = isRedirectMethod(method);

    const currentFingerprint = useMemo(
        () => fingerprintVerificationInputs({ provider, method, credentialName, fieldValues }),
        [provider, method, credentialName, fieldValues],
    );
    const currentTestResult =
        testResult && testResult.fingerprint === currentFingerprint ? testResult : null;
    const isVerified = currentTestResult?.success === true;

    const blockReason = getAddProviderStepBlockReason(currentStep.id, {
        provider,
        method,
        credentialName,
        credentialFieldsComplete: hasPrimaryCredentialField(resolvedProvider, fieldValues, method),
        verified: isVerified,
    });
    const isPagerDutyOAuthReady = hasPrimaryCredentialField(resolvedProvider, fieldValues, method);

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
        setCredentialName("");
    }
    function handleMethodChange(next: AddProviderMethod) {
        setMethod(next);
        setFieldValues({});
    }
    function handleFieldChange(name: string, value: string) {
        setFieldValues((prev) => ({ ...prev, [name]: value }));
    }

    function handleVerify() {
        const testedFingerprint = currentFingerprint;
        const testedProvider = resolvedProvider;
        const testedName = credentialName || "default";
        const testedFields = fieldValues;
        startPending(async () => {
            const result = await testConnection(testedProvider, {
                name: testedName,
                credentials: testedFields,
            });
            if (result.error || !result.data?.success) {
                setTestResult({
                    fingerprint: testedFingerprint,
                    success: false,
                    message: result.error ?? result.data?.error ?? "Connection test failed",
                });
                return;
            }
            setTestResult({
                fingerprint: testedFingerprint,
                success: true,
                message: "Connection successful",
            });
        });
    }

    function handleStartPagerDutyOAuth() {
        if (method !== "pagerduty_oauth" || !isPagerDutyOAuthReady) return;

        startPending(async () => {
            const result = await startPagerDutyOAuthCredential({
                credentialName,
                fields: fieldValues,
            });
            if (result.error || !result.data) {
                toast.error(result.error ?? "PagerDuty authorization could not be started.");
                return;
            }
            window.location.assign(result.data.authorize_url);
        });
    }

    function handleFinish() {
        if (!isVerified) return;
        startPending(async () => {
            const result = await saveAddProviderCredential({
                provider: resolvedProvider,
                method,
                credentialName,
                fields: fieldValues,
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
                    <ProviderSelectStep
                        canCreatePagerDuty={canCreatePagerDuty}
                        provider={provider}
                        onChangeAction={handleProviderChange}
                    />
                )}
                {currentStep.id === "method" && (
                    <AuthMethodStep
                        provider={resolvedProvider}
                        method={method}
                        onChooseAction={handleMethodChange}
                    />
                )}
                {currentStep.id === "credential" && (
                    <CredentialEntryStep
                        provider={resolvedProvider}
                        method={method}
                        credentialName={credentialName}
                        isPending={isPending}
                        isPagerDutyOAuthReady={isPagerDutyOAuthReady}
                        onCredentialNameChangeAction={setCredentialName}
                        onFieldChangeAction={handleFieldChange}
                        onStartPagerDutyOAuthAction={handleStartPagerDutyOAuth}
                    />
                )}
                {currentStep.id === "verify" && (
                    <VerifyConnectionStep
                        isPending={isPending}
                        testResult={currentTestResult}
                        onVerifyAction={handleVerify}
                    />
                )}
                {currentStep.id === "review" && (
                    <FinishStep
                        providerLabel={PROVIDER_LABELS[resolvedProvider]}
                        credentialName={credentialName}
                        authMethodLabel={getManualAuthMethodLabel(resolvedProvider, method)}
                        verified={isVerified}
                        isPending={isPending}
                        submitted={submitted}
                        onBackAction={goBack}
                        onFinishAction={handleFinish}
                        onDoneAction={onCloseAction}
                    />
                )}
            </div>

            {!(redirect && currentStep.id === "credential") && currentStep.id !== "review" && (
                <StepNav
                    onBackAction={clampedIndex > 0 ? goBack : undefined}
                    onContinueAction={goNext}
                    blockReason={blockReason}
                />
            )}
        </div>
    );
}
