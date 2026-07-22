import type { ChangeEvent, ReactNode } from "react";
import { Button } from "@/components/shared/Button";
import { GitHubForm, GitLabForm, JiraForm, LinearForm, LaunchDarklyForm } from "../ProviderForms";
import { GitHubAppConnect } from "../GitHubAppConnect";
import { PagerDutyCredentialFields } from "../PagerDutyCredentialFields";
import { isPagerDutyAddProviderMethod, type AddProviderMethod } from "../addProviderWizardSteps";
import type { Provider } from "@/lib/admin/types";

type CredentialEntryStepProps = {
    provider: Provider;
    method: AddProviderMethod | null;
    credentialName: string;
    isPending: boolean;
    isPagerDutyOAuthReady: boolean;
    onCredentialNameChangeAction: (name: string) => void;
    onFieldChangeAction: (name: string, value: string) => void;
    onStartPagerDutyOAuthAction: () => void;
};

function renderProviderFields(provider: Provider, method: AddProviderMethod | null): ReactNode {
    switch (provider) {
        case "github":
            return <GitHubForm />;
        case "gitlab":
            return <GitLabForm />;
        case "jira":
            return <JiraForm />;
        case "linear":
            return <LinearForm />;
        case "launchdarkly":
            return <LaunchDarklyForm />;
        case "pagerduty":
            return isPagerDutyAddProviderMethod(method) ? (
                <PagerDutyCredentialFields method={method} />
            ) : null;
    }
}

/**
 * Credential entry step (CHAOS-2837): for the `github_app` method this is
 * just the one-click install CTA (the backend activates the credential on
 * the OAuth round trip — see `isRedirectMethod`). For every other path it's
 * a credential name field plus the provider's existing manual form fields,
 * with field values captured via change-event delegation (no per-field
 * controlled-input plumbing needed) so the wizard's pure gate functions can
 * read live completeness without altering the existing uncontrolled
 * `ProviderForms` markup.
 */
export function CredentialEntryStep({
    provider,
    method,
    credentialName,
    isPending,
    isPagerDutyOAuthReady,
    onCredentialNameChangeAction,
    onFieldChangeAction,
    onStartPagerDutyOAuthAction,
}: CredentialEntryStepProps) {
    if (method === "github_app") {
        return (
            <div className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">Credential</h2>
                <GitHubAppConnect variant="flat" />
            </div>
        );
    }

    function handleFieldChange(event: ChangeEvent<HTMLDivElement>) {
        const target = event.target;
        if (
            !(target instanceof HTMLInputElement) &&
            !(target instanceof HTMLTextAreaElement) &&
            !(target instanceof HTMLSelectElement)
        ) {
            return;
        }
        onFieldChangeAction(target.name, target.value);
    }

    return (
        <div className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Credential</h2>
            <div>
                <label
                    htmlFor="credential_name"
                    className="block text-sm font-medium text-(--ink-base)"
                >
                    Credential Name
                </label>
                <div className="mt-1">
                    <input
                        type="text"
                        name="credential_name"
                        id="credential_name"
                        value={credentialName}
                        onChange={(e) => onCredentialNameChangeAction(e.target.value)}
                        className="block w-full rounded-md border-(--border-base) bg-(--surface-base) px-3 py-2 text-(--ink-base) shadow-sm focus:border-(--surface-inverted) focus:outline-none focus:ring-1 focus:ring-(--surface-inverted) sm:text-sm"
                        placeholder='e.g., "Production Token" (defaults to "default")'
                    />
                </div>
            </div>
            <div onChange={handleFieldChange} className="space-y-4">
                {renderProviderFields(provider, method)}
            </div>
            {method === "pagerduty_oauth" ? (
                <Button
                    variant="primary"
                    disabled={isPending || !isPagerDutyOAuthReady}
                    onClick={onStartPagerDutyOAuthAction}
                >
                    Connect PagerDuty
                </Button>
            ) : null}
        </div>
    );
}
