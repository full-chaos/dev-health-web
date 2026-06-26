import { redirect } from "next/navigation";

import { OnboardForm } from "@/components/auth/OnboardForm";
import { OnboardStepShell } from "@/components/onboarding/OnboardStepShell";
import { apiClient } from "@/lib/apiClient";
import { auth } from "@/lib/auth";
import {
    ONBOARDING_STATE_ENDPOINT,
    onboardedDestination,
    targetForNextStep,
} from "@/lib/onboarding/routing";
import type { OnboardingState } from "@/lib/onboarding/types";
import { runtimeConfig } from "@/lib/runtimeConfig";

type SearchParams = Promise<{ plan?: string; trial?: string }>;

/**
 * Guided onboarding — workspace step (CHAOS-2674). Creates the organization via
 * the shared {@link OnboardForm}; on success the form advances to the
 * integration step instead of the dashboard.
 */
export default async function OnboardWorkspacePage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const params = await searchParams;
    const plan = params.plan?.toLowerCase();
    const trialIntent = plan === "team" && params.trial === "true";

    const session = await auth();
    if (!session?.user) {
        redirect("/auth/signin");
    }
    if (!runtimeConfig.guidedOnboarding()) {
        redirect("/auth/onboard");
    }

    // Enforce C1 alignment: a user landing directly on the wrong step is
    // redirected per `next_step`. On a C1 failure we never mis-route — an
    // already-onboarded session is sent to the product, otherwise we render
    // the workspace step they navigated to.
    let state: OnboardingState | null = null;
    try {
        state = await apiClient.getJson<OnboardingState>(ONBOARDING_STATE_ENDPOINT);
    } catch {
        state = null;
    }
    if (state) {
        if (state.next_step !== "workspace") {
            redirect(targetForNextStep(state.next_step, trialIntent));
        }
    } else if (session.user.org_id && !session.user.needs_onboarding) {
        redirect(onboardedDestination(trialIntent));
    }

    return (
        <OnboardStepShell
            currentStep="workspace"
            title="Set up your workspace"
            subtitle="Create your organization to get started."
        >
            <div className="flex justify-center">
                <OnboardForm plan={plan} trialIntent={trialIntent} guided />
            </div>
        </OnboardStepShell>
    );
}
