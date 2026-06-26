import { redirect } from "next/navigation";

import { OnboardForm } from "@/components/auth/OnboardForm";
import { apiClient } from "@/lib/apiClient";
import { auth } from "@/lib/auth";
import type { OnboardingNextStep, OnboardingState } from "@/lib/onboarding/types";
import { runtimeConfig } from "@/lib/runtimeConfig";

type SearchParams = Promise<{ plan?: string; trial?: string }>;

const TRIAL_CHECKOUT = "/auth/trial-checkout?plan=team&trial=true";
const ONBOARDING_STATE_ENDPOINT = "/api/v1/auth/onboarding/state";

function withTrial(path: string, trialIntent: boolean): string {
    if (!trialIntent) return path;
    return `${path}?plan=team&trial=true`;
}

/**
 * Maps the C1 `next_step` to a concrete guided route. Routing is derived from
 * the onboarding state alone (never the feature flag), so the user always lands
 * on the step the backend says they are on.
 */
function targetForNextStep(nextStep: OnboardingNextStep, trialIntent: boolean): string {
    switch (nextStep) {
        case "workspace":
            return withTrial("/auth/onboard/workspace", trialIntent);
        case "integration":
            return withTrial("/auth/onboard/integration", trialIntent);
        case "complete":
            return withTrial("/auth/onboard/complete", trialIntent);
        case "dashboard":
            return trialIntent ? TRIAL_CHECKOUT : "/dashboard";
    }
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

    const nextStep: OnboardingNextStep = state?.next_step ?? "workspace";
    redirect(targetForNextStep(nextStep, trialIntent));
}
