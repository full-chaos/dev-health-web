import { redirect } from "next/navigation";

import { OnboardForm } from "@/components/auth/OnboardForm";
import { OnboardStepShell } from "@/components/onboarding/OnboardStepShell";
import { auth } from "@/lib/auth";
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
