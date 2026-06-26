import { redirect } from "next/navigation";

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
 * Guided onboarding — completion step (CHAOS-2674). Confirms setup is done and
 * routes the user into the product (or the team-trial checkout when that intent
 * was carried through the flow).
 */
export default async function OnboardCompletePage({
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

    // Enforce C1 alignment: a user landing directly on the completion step when
    // the backend says they still have setup to do is redirected per `next_step`.
    // A C1 failure never mis-routes — an already-onboarded session is sent to
    // the product, otherwise we render the completion confirmation.
    let state: OnboardingState | null = null;
    try {
        state = await apiClient.getJson<OnboardingState>(ONBOARDING_STATE_ENDPOINT);
    } catch {
        state = null;
    }
    if (state) {
        if (state.next_step !== "complete") {
            redirect(targetForNextStep(state.next_step, trialIntent));
        }
    } else if (session.user.org_id && !session.user.needs_onboarding) {
        redirect(onboardedDestination(trialIntent));
    }

    const destination = trialIntent ? "/auth/trial-checkout?plan=team&trial=true" : "/dashboard";
    const continueLabel = trialIntent ? "Continue to checkout" : "Go to dashboard";

    return (
        <OnboardStepShell
            currentStep="complete"
            title="You're all set"
            subtitle="Your workspace is ready. Head to your dashboard to start exploring."
        >
            <div className="space-y-6 text-center">
                <div
                    role="status"
                    className="rounded-lg border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-700"
                >
                    Onboarding complete. As your integrations sync, your dashboard will fill in with
                    delivery, review, and engineering-health signals.
                </div>
                <a
                    href={destination}
                    className="inline-flex w-full items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
                >
                    {continueLabel}
                </a>
            </div>
        </OnboardStepShell>
    );
}
