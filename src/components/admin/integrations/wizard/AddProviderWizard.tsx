"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CTA_LABELS } from "@/lib/design/cta";
import { AddProviderStepProgress } from "./AddProviderStepProgress";
import { StepNav } from "@/components/admin/sync/config-form/StepNav";
import { createCredential, testConnection } from "@/lib/admin/server";
import { PROVIDER_LABELS, type IntegrationCredential, type Provider } from "@/lib/admin/types";
import { hasGitHubAppCredential, getManualAuthMethodLabel } from "../authMethod";
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
    /** Set when launched from a specific provider's detail page — skips the provider-select step. */
    lockedProvider?: Provider;
    /** All credentials, used only to detect an existing GitHub App connection. */
    credentials: IntegrationCredential[];
    onCloseAction: () => void;
    /** Fired once the credential is actually persisted. */
    onCreatedAction: () => void;
};

/** A completed test-connection result, tagged with the exact inputs it tested. */
type TestResult = {
    fingerprint: string;
    success: boolean;
    message: string;
};

function initialMethod(provider: Provider | "", hasGitHubApp: boolean): AddProviderMethod | null {
    if (!provider) return null;
    return providerHasAuthMethodChoice(provider, hasGitHubApp) ? null : "manual";
}

/**
 * Guided Add Provider workflow (CHAOS-2837): provider → auth method →
 * credential → verify → review, orchestrated the same way
 * `CreateSyncConfigWizard` orchestrates the sync-config creation flow —
 * a pure step model (`addProviderWizardSteps.ts`) decides visibility/gating,
 * this component only wires state to it and to the existing credential
 * server actions.
 *
 * The GitHub App redirect method drops verify/review entirely (see
 * `getVisibleAddProviderSteps`) — the `credential` step's install CTA is the
 * terminal step for that path, so the step-nav Continue footer is hidden
 * once that method is chosen (there's nothing left to continue to).
 *
 * Verification is never a bare boolean (see `verificationFingerprint.ts`):
 * `testConnection` is async, so the user can go Back and edit any input
 * while a request is still in flight. "Is the form verified" is derived on
 * every render by comparing the current inputs' fingerprint against the
 * fingerprint the last *successful* test actually ran against — a stale
 * resolution for edited-away inputs can never match the live fingerprint,
 * so it can never re-enable Finish for inputs it didn't test.
 */
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
    // A stale result (from an in-flight request resolved after the user
    // edited something) is tagged with the fingerprint it actually tested —
    // it only counts as "current" when that still matches the live inputs.
    const currentTestResult =
        testResult && testResult.fingerprint === currentFingerprint ? testResult : null;
    const isVerified = currentTestResult?.success === true;

    const blockReason = getAddProviderStepBlockReason(currentStep.id, {
        provider,
        method,
        credentialName,
        credentialFieldsComplete: hasPrimaryCredentialField(resolvedProvider, fieldValues),
        verified: isVerified,
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
        // Snapshot the exact inputs this request tests, at the moment it's
        // fired — not re-read from state when it resolves, which may be
        // arbitrarily later and reflect edits the user made in the meantime.
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

    function handleFinish() {
        // Gated on the fingerprint-derived `isVerified`, never a bare
        // boolean: a manual credential can never be persisted unless the
        // CURRENT inputs are exactly what the last successful test ran
        // against (CHAOS-2837 — closes the stale in-flight-verify race).
        if (!isVerified) return;
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
                    <ProviderSelectStep
                        canCreatePagerDuty={canCreatePagerDuty}
                        provider={provider}
                        onChangeAction={handleProviderChange}
                    />
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
                        isPending={isPending}
                        testResult={currentTestResult}
                        onVerifyAction={handleVerify}
                    />
                )}
                {currentStep.id === "review" && (
                    <FinishStep
                        providerLabel={PROVIDER_LABELS[resolvedProvider]}
                        credentialName={credentialName}
                        authMethodLabel={getManualAuthMethodLabel(resolvedProvider)}
                        verified={isVerified}
                        isPending={isPending}
                        submitted={submitted}
                        onBackAction={goBack}
                        onFinishAction={handleFinish}
                        onDoneAction={onCloseAction}
                    />
                )}
            </div>

            {/* The credential step is terminal for the github_app redirect method —
                its install CTA navigates the browser away, so there is nothing
                to "Continue" to. Every other step (including "method" even
                after github_app is chosen there) still needs its Continue. */}
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
