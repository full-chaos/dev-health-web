/**
 * Guided Add Provider workflow (CHAOS-2837): step definitions and the pure
 * gating rules that decide when a step can be advanced past. Mirrors the
 * sync-config wizard's pure step-model approach
 * (`components/admin/sync/config-form/wizardSteps.ts`) so the flow is
 * testable without rendering anything.
 */

export type AddProviderStepId = "provider" | "method" | "credential" | "verify" | "review";

export type AddProviderStep = {
    id: AddProviderStepId;
    label: string;
};

const ALL_STEPS: AddProviderStep[] = [
    { id: "provider", label: "Provider" },
    { id: "method", label: "Auth method" },
    { id: "credential", label: "Credential" },
    { id: "verify", label: "Verify connection" },
    { id: "review", label: "Review" },
];

export type PagerDutyAddProviderMethod =
    "pagerduty_oauth" | "pagerduty_client_credentials" | "pagerduty_api_token";

export type AddProviderMethod = "github_app" | "manual" | PagerDutyAddProviderMethod;

export function providerHasAuthMethodChoice(provider: string, hasGitHubApp: boolean): boolean {
    return (provider === "github" && !hasGitHubApp) || provider === "pagerduty";
}

/**
 * The step list actually shown. `lockProvider` skips the provider-select
 * step when the wizard is launched from a specific provider's detail page
 * (the provider is already fixed by the entry point, not chosen mid-flow).
 *
 * The GitHub App redirect method (`method === "github_app"`) drops `verify`
 * and `review` entirely: the one-click install is a full-page redirect to
 * GitHub and back, and the backend creates + verifies the credential
 * atomically on that round trip (`install-callback`), so the wizard has
 * nothing left to verify or review in-session — the `credential` step (the
 * install CTA itself) is the terminal step for that path, not a dead end
 * behind an unreachable Finish button.
 */
export function getVisibleAddProviderSteps(
    provider: string,
    hasGitHubApp: boolean,
    lockProvider: boolean,
    method: AddProviderMethod | null,
): AddProviderStep[] {
    return ALL_STEPS.filter((step) => {
        if (step.id === "provider") return !lockProvider;
        if (step.id === "method") return providerHasAuthMethodChoice(provider, hasGitHubApp);
        if (step.id === "verify" || step.id === "review") return !isRedirectMethod(method);
        return true;
    });
}

export type AddProviderStepGateContext = {
    provider: string;
    method: AddProviderMethod | null;
    credentialName: string;
    credentialFieldsComplete: boolean;
    verified: boolean;
};

export function isRedirectMethod(method: AddProviderMethod | null): boolean {
    return method === "github_app" || method === "pagerduty_oauth";
}

export function isPagerDutyAddProviderMethod(
    method: AddProviderMethod | null,
): method is PagerDutyAddProviderMethod {
    return (
        method === "pagerduty_oauth" ||
        method === "pagerduty_client_credentials" ||
        method === "pagerduty_api_token"
    );
}

/**
 * Returns a user-facing reason the current step can't be left yet, or
 * `null` when the step's prerequisites are satisfied.
 */
export function getAddProviderStepBlockReason(
    stepId: AddProviderStepId,
    ctx: AddProviderStepGateContext,
): string | null {
    if (stepId === "provider" && !ctx.provider) {
        return "Choose a provider to continue.";
    }
    if (stepId === "method" && !ctx.method) {
        return "Choose how you want to authenticate to continue.";
    }
    if (stepId === "credential" && !isRedirectMethod(ctx.method) && !ctx.credentialFieldsComplete) {
        // Credential name is optional — it defaults to "default" on save
        // (matches the pre-existing credential-create behavior); only the
        // provider's primary secret field actually gates progress.
        return "Fill in the required fields to continue.";
    }
    if (stepId === "verify" && !isRedirectMethod(ctx.method) && !ctx.verified) {
        return "Test the connection successfully to continue.";
    }
    return null;
}
