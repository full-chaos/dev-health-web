"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import {
    GitHubAppConnect,
    type GitHubAppConnectResult,
} from "@/components/admin/integrations/GitHubAppConnect";
import { CTA_LABELS } from "@/lib/design/cta";
import { resolveOrigin } from "@/lib/origin";
import { trackOnboardingEvent, trackOnboardingEventOnce } from "@/lib/onboarding/track";

type OnboardIntegrationStepProps = {
    /** Provider the backend recommends connecting first (C1). Defaults to GitHub. */
    recommendedProvider?: string;
    /** Whether the org already has a first integration connected (C1). */
    connected?: boolean;
    /** Whether the user previously skipped the integration step (C1). */
    skipped?: boolean;
    /** Outcome of a returning GitHub App install callback, surfaced as a banner. */
    result?: GitHubAppConnectResult;
    /** Preserve the team-trial checkout intent when advancing to completion. */
    trialIntent?: boolean;
    /** Active org id, attached to funnel events. */
    orgId?: string | null;
};

const INTEGRATIONS_HUB = "/org/admin/integrations";
const RETURN_TO = "/auth/onboard/integration";

const SECONDARY_PROVIDERS: { key: string; label: string }[] = [
    { key: "gitlab", label: "GitLab" },
    { key: "jira", label: "Jira" },
    { key: "linear", label: "Linear" },
];

const PRIMARY_BUTTON_CLASSES =
    "inline-flex w-full items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2";

const SECONDARY_LINK_CLASSES =
    "inline-flex w-full items-center justify-between rounded-md border border-[var(--card-stroke)] bg-[var(--background)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

/**
 * CHAOS-2675 integration step body. Leads with the frictionless GitHub App
 * install (the recommended path), offers secondary providers and a manual
 * token, and lets the user skip — persisting the skip via the C6 endpoint
 * before advancing to completion. Renders connected / error / pending / skipped
 * states and emits the CHAOS-2683 funnel events at each interaction point.
 */
export function OnboardIntegrationStep({
    connected = false,
    skipped = false,
    result,
    trialIntent = false,
    orgId = null,
}: OnboardIntegrationStepProps) {
    const { data: session } = useSession();
    const [skipping, setSkipping] = useState(false);
    const [skipError, setSkipError] = useState<string | null>(null);

    useEffect(() => {
        trackOnboardingEventOnce("integration_step_viewed", { orgId });
    }, [orgId]);

    const completeHref = trialIntent
        ? "/auth/onboard/complete?plan=team&trial=true"
        : "/auth/onboard/complete";
    const isConnected = connected || result === "connected";

    const handleInstallStart = () => {
        trackOnboardingEvent("github_app_install_started", { orgId });
    };

    const handleSkip = async () => {
        setSkipError(null);
        setSkipping(true);
        try {
            const res = await fetch(`${resolveOrigin()}/api/v1/auth/onboarding/skip-integration`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session?.access_token}`,
                },
            });
            if (!res.ok) {
                setSkipError("We couldn't skip this step. Please try again.");
                setSkipping(false);
                return;
            }
            // Emit only after the skip is durably persisted, so a failed/retried
            // POST never records a false or duplicate skip.
            trackOnboardingEvent("integration_skipped", { orgId });
            window.location.href = completeHref;
        } catch {
            setSkipError("We couldn't skip this step. Please try again.");
            setSkipping(false);
        }
    };

    if (isConnected) {
        return (
            <div className="space-y-6">
                <div
                    role="status"
                    className="rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-700"
                >
                    Your first integration is connected. Dev Health will start mapping pull
                    requests, reviews, and delivery signals from it.
                </div>
                <a href={completeHref} className={PRIMARY_BUTTON_CLASSES}>
                    {CTA_LABELS.continueStep}
                </a>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-[var(--ink-muted)]">
                Connect at least one source so Dev Health can measure pull-request flow, review
                load, delivery, and engineering-health signals. Until a tool is connected these
                views stay empty.
            </p>

            {skipped ? (
                <div
                    role="status"
                    className="rounded-lg border border-[var(--card-stroke)] bg-[var(--background)] p-4 text-sm text-[var(--ink-muted)]"
                >
                    You skipped this earlier. You can still connect a tool now, or continue and add
                    one from settings later.
                </div>
            ) : null}

            <GitHubAppConnect
                result={result}
                returnTo={RETURN_TO}
                onInstallClickAction={handleInstallStart}
            />

            <section aria-labelledby="onboard-secondary-providers" className="space-y-3">
                <h2
                    id="onboard-secondary-providers"
                    className="text-sm font-medium text-[var(--foreground)]"
                >
                    Or connect another provider
                </h2>
                <ul className="space-y-2">
                    {SECONDARY_PROVIDERS.map((provider) => (
                        <li key={provider.key}>
                            <a
                                href={`${INTEGRATIONS_HUB}?provider=${provider.key}`}
                                className={SECONDARY_LINK_CLASSES}
                            >
                                <span>Connect {provider.label}</span>
                                <span aria-hidden="true">→</span>
                            </a>
                        </li>
                    ))}
                    <li>
                        <a href={`${INTEGRATIONS_HUB}/github`} className={SECONDARY_LINK_CLASSES}>
                            <span>Use a personal access token</span>
                            <span aria-hidden="true">→</span>
                        </a>
                    </li>
                </ul>
            </section>

            {skipError ? (
                <p role="alert" className="text-sm text-red-600">
                    {skipError}
                </p>
            ) : null}

            <div className="flex items-center justify-end gap-4 border-t border-[var(--card-stroke)] pt-4">
                {skipped ? (
                    <a href={completeHref} className={PRIMARY_BUTTON_CLASSES}>
                        {CTA_LABELS.continueStep}
                    </a>
                ) : (
                    <button
                        type="button"
                        onClick={handleSkip}
                        disabled={skipping}
                        className="text-sm font-medium text-[var(--ink-muted)] underline-offset-2 transition-colors hover:text-[var(--foreground)] hover:underline disabled:opacity-50"
                    >
                        {skipping ? "Skipping…" : "Skip for now"}
                    </button>
                )}
            </div>
        </div>
    );
}
