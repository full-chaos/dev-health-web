import { redirect } from "next/navigation";

import { OnboardForm } from "@/components/auth/OnboardForm";
import { apiClient } from "@/lib/apiClient";
import { auth } from "@/lib/auth";
import { CTA_LABELS } from "@/lib/design/cta";
import {
    ONBOARDING_STATE_ENDPOINT,
    onboardedDestination,
    targetForNextStep,
    TRIAL_CHECKOUT,
    withTrial,
} from "@/lib/onboarding/routing";
import type { OnboardingState } from "@/lib/onboarding/types";
import { runtimeConfig } from "@/lib/runtimeConfig";

type SearchParams = Promise<{ plan?: string; trial?: string }>;

/**
 * Error/retry surface shown when the C1 onboarding-state call fails and we
 * cannot safely route. Deliberately never guesses a step (a wrong guess could
 * strand an onboarded user on workspace) — it offers a retry that re-runs this
 * server component, preserving any team-trial intent.
 */
function OnboardingStateError({ retryHref }: { retryHref: string }) {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-4 py-12 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-6 text-center">
                <div
                    role="alert"
                    className="rounded-lg border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-8 shadow"
                >
                    <h2 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
                        We couldn&apos;t load your onboarding
                    </h2>
                    <p className="mt-2 text-sm text-[var(--ink-muted)]">
                        Something went wrong reaching our servers. Your progress is safe — please
                        try again.
                    </p>
                    <a
                        href={retryHref}
                        className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
                    >
                        {CTA_LABELS.retry}
                    </a>
                </div>
            </div>
        </div>
    );
}

/**
 * First-run onboarding entry point (CHAOS-2674).
 *
 * With the guided flow enabled it reads the onboarding state (C1) and redirects
 * to the matching step route. With the flag off it preserves the legacy
 * single-page workspace-creation behavior.
 */
export default async function OnboardPage({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    const plan = params.plan?.toLowerCase();
    const trialIntent = plan === "team" && params.trial === "true";

    const session = await auth();
    if (!session?.user) {
        redirect("/auth/signin");
    }

    if (!runtimeConfig.guidedOnboarding()) {
        if (session.user.org_id && !session.user.needs_onboarding) {
            redirect(trialIntent ? TRIAL_CHECKOUT : "/dashboard");
        }

        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-4 py-12 sm:px-6 lg:px-8">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center">
                        <h2 className="mt-6 text-3xl font-bold tracking-tight text-[var(--foreground)]">
                            Set up your workspace
                        </h2>
                        <p className="mt-2 text-sm text-[var(--ink-muted)]">
                            Create your organization to get started
                        </p>
                    </div>
                    <div className="mt-8 rounded-lg border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-8 shadow sm:px-10">
                        <OnboardForm plan={plan} trialIntent={trialIntent} />
                    </div>
                </div>
            </div>
        );
    }

    let state: OnboardingState | null = null;
    try {
        state = await apiClient.getJson<OnboardingState>(ONBOARDING_STATE_ENDPOINT);
    } catch {
        state = null;
    }

    if (state) {
        redirect(targetForNextStep(state.next_step, trialIntent));
    }

    // C1 failed. NEVER default to a guided step — guessing "workspace" could
    // strand an already-onboarded user on setup during a transient failure. If
    // the session already shows a completed org, send them to the product;
    // otherwise surface a retry instead of mis-routing.
    if (session.user.org_id && !session.user.needs_onboarding) {
        redirect(onboardedDestination(trialIntent));
    }

    return <OnboardingStateError retryHref={withTrial("/auth/onboard", trialIntent)} />;
}
