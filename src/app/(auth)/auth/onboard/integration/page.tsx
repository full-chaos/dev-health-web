import { redirect } from "next/navigation";

import { OnboardIntegrationStep } from "@/components/onboarding/OnboardIntegrationStep";
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

type SearchParams = Promise<{ plan?: string; trial?: string; github_app?: string }>;

function resultFromParam(value?: string) {
    if (value === "connected") return "connected" as const;
    if (value === "error") return "error" as const;
    return undefined;
}

/**
 * Guided onboarding — integration step (CHAOS-2675). Loads the onboarding state
 * (C1) to surface the connected / skipped status and recommended provider, then
 * renders the GitHub-App-led connect experience.
 */
export default async function OnboardIntegrationPage({
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

    let state: OnboardingState | null = null;
    try {
        state = await apiClient.getJson<OnboardingState>(ONBOARDING_STATE_ENDPOINT);
    } catch {
        state = null;
    }

    // Enforce C1 alignment: a direct landing on the wrong step is redirected per
    // `next_step`. A C1 failure never mis-routes — an already-onboarded session
    // is sent to the product, otherwise we render the integration step best-effort.
    if (state) {
        if (state.next_step !== "integration") {
            redirect(targetForNextStep(state.next_step, trialIntent));
        }
    } else if (session.user.org_id && !session.user.needs_onboarding) {
        redirect(onboardedDestination(trialIntent));
    }

    return (
        <OnboardStepShell
            currentStep="integration"
            title="Connect your tools"
            subtitle="Integrations power your PR, review, delivery, and engineering-health metrics."
        >
            <OnboardIntegrationStep
                recommendedProvider={state?.recommended_provider ?? "github"}
                connected={state?.first_integration_connected ?? false}
                skipped={state?.integration_skipped ?? false}
                result={resultFromParam(params.github_app)}
                trialIntent={trialIntent}
                orgId={state?.org_id ?? session.user.org_id ?? null}
            />
        </OnboardStepShell>
    );
}
