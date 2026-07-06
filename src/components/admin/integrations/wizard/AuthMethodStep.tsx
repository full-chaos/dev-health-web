import { CTA_LABELS } from "@/lib/design/cta";
import type { AddProviderMethod } from "../addProviderWizardSteps";

type AuthMethodStepProps = {
    method: AddProviderMethod | null;
    onChooseAction: (method: AddProviderMethod) => void;
};

/**
 * Auth-method choice for GitHub (CHAOS-2837 AC5/AC6): the one-click GitHub
 * App install is the recommended, visually primary path; the manual
 * personal-access-token path is a plainly secondary link underneath it, not
 * a second equally-weighted card. Only rendered when no GitHub App is
 * connected yet (`providerHasAuthMethodChoice`) — otherwise this step is
 * skipped entirely and the flow goes straight to the manual credential step.
 */
export function AuthMethodStep({ method, onChooseAction }: AuthMethodStepProps) {
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
