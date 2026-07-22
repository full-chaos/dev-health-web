import { CTA_LABELS } from "@/lib/design/cta";
import type { AddProviderMethod } from "../addProviderWizardSteps";
import type { Provider } from "@/lib/admin/types";

type AuthMethodStepProps = {
    provider: Provider;
    method: AddProviderMethod | null;
    isPending?: boolean;
    error?: string | null;
    onChooseAction: (method: AddProviderMethod) => void;
};

export function AuthMethodStep({
    provider,
    method,
    isPending = false,
    error,
    onChooseAction,
}: AuthMethodStepProps) {
    if (provider === "pagerduty") {
        return (
            <div className="space-y-4">
                <div>
                    <h2 className="text-sm font-semibold text-foreground">Auth method</h2>
                    <p className="mt-1 text-xs text-(--ink-muted)">
                        Choose how Dev Health connects to PagerDuty.
                    </p>
                </div>

                <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onChooseAction("pagerduty_oauth")}
                    aria-pressed={method === "pagerduty_oauth"}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                        method === "pagerduty_oauth"
                            ? "border-(--accent) bg-(--accent)/10"
                            : "border-(--card-stroke) hover:bg-(--card-70)"
                    }`}
                >
                    <p className="text-sm font-semibold text-foreground">OAuth authorization</p>
                    <p className="mt-1 text-xs text-(--ink-muted)">
                        Authorize scoped PagerDuty access in a browser using PKCE.
                    </p>
                </button>

                {error ? (
                    <p role="alert" className="text-sm text-(--negative)">
                        {error}
                    </p>
                ) : null}

                <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onChooseAction("pagerduty_client_credentials")}
                    aria-pressed={method === "pagerduty_client_credentials"}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                        method === "pagerduty_client_credentials"
                            ? "border-(--accent) bg-(--accent)/10"
                            : "border-(--card-stroke) hover:bg-(--card-70)"
                    }`}
                >
                    <p className="text-sm font-semibold text-foreground">Private app credentials</p>
                    <p className="mt-1 text-xs text-(--ink-muted)">
                        Use a private scoped OAuth app&apos;s client ID and secret without a browser
                        callback.
                    </p>
                </button>

                <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onChooseAction("pagerduty_api_token")}
                    aria-pressed={method === "pagerduty_api_token"}
                    className={`text-xs font-medium underline-offset-2 hover:underline ${
                        method === "pagerduty_api_token" ? "text-(--accent)" : "text-(--ink-muted)"
                    }`}
                >
                    {CTA_LABELS.usePagerDutyApiToken}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-sm font-semibold text-foreground">Auth method</h2>
                <p className="mt-1 text-xs text-(--ink-muted)">
                    GitHub App is the recommended path — no tokens to paste, and it&apos;s scoped to
                    the repositories you install it on.
                </p>
            </div>

            <button
                type="button"
                onClick={() => onChooseAction("github_app")}
                aria-pressed={method === "github_app"}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    method === "github_app"
                        ? "border-(--accent) bg-(--accent)/10"
                        : "border-(--card-stroke) hover:bg-(--card-70)"
                }`}
            >
                <p className="text-sm font-semibold text-foreground">{CTA_LABELS.useGitHubApp}</p>
                <p className="mt-1 text-xs text-(--ink-muted)">
                    One-click install. Recommended for every new GitHub connection.
                </p>
            </button>

            <button
                type="button"
                onClick={() => onChooseAction("manual")}
                aria-pressed={method === "manual"}
                className={`text-xs font-medium underline-offset-2 hover:underline ${
                    method === "manual" ? "text-(--accent)" : "text-(--ink-muted)"
                }`}
            >
                {CTA_LABELS.useManualToken}
            </button>
        </div>
    );
}
