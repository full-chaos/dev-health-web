"use client";

import { isValidationStatus } from "@/lib/actionFailure";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/errorMessages";
import { createWorkspace } from "@/lib/onboarding/actions";
import { trackOnboardingEvent, trackOnboardingEventOnce } from "@/lib/onboarding/track";

type OnboardFormProps = {
    plan?: string;
    trialIntent?: boolean;
    /**
     * When true the form is the workspace step of the guided first-run flow
     * (CHAOS-2674): it emits the workspace funnel events and routes onward to
     * the integration step instead of the dashboard. Off preserves the legacy
     * single-page behaviour.
     */
    guided?: boolean;
};

export function OnboardForm({ plan, trialIntent = false, guided = false }: OnboardFormProps) {
    const { update, status } = useSession();
    const [orgName, setOrgName] = useState("");
    const [loading, setLoading] = useState(false);
    const isTeamTrialIntent = trialIntent && plan?.toLowerCase() === "team";

    useEffect(() => {
        if (guided) {
            trackOnboardingEventOnce("workspace_setup_started");
        }
    }, [guided]);

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // CHAOS-12088: a server action creates the workspace with the session's token. The
            // new token pair comes back sealed: this page passes it to update() and cannot read it.
            const result = await createWorkspace(orgName);

            if (!result.ok) {
                if (result.status === 429) {
                    toast.error("Too many requests. Please try again later.");
                    return;
                }
                toast.error(
                    extractErrorMessage(
                        isValidationStatus(result.status ?? undefined) ? result.detail : undefined,
                        "Failed to create workspace",
                    ),
                );
                return;
            }

            if (guided) {
                trackOnboardingEvent("workspace_created", { orgId: result.orgId });
            }

            // next-auth's update() does nothing while a session read is running: try again.
            let sessionReady = false;
            for (let attempt = 0; attempt < 5 && !sessionReady; attempt += 1) {
                try {
                    const updated = await update({ sessionHandoff: result.sessionHandoff });
                    if (updated) {
                        sessionReady = true;
                    } else {
                        await delay(300 * (attempt + 1));
                    }
                } catch {
                    await delay(300 * (attempt + 1));
                }
            }

            // Guided onboarding ALWAYS routes through the integration step (the
            // team-trial intent is preserved as query params and resolved at the
            // completion step). Only the legacy single-page flow keeps the direct
            // trial-checkout redirect.
            let destination: string;
            if (guided) {
                destination = isTeamTrialIntent
                    ? "/auth/onboard/integration?plan=team&trial=true"
                    : "/auth/onboard/integration";
            } else if (isTeamTrialIntent) {
                destination = "/auth/trial-checkout?plan=team&trial=true";
            } else {
                destination = "/dashboard";
            }

            // Hard navigation ensures the proxy reads the freshly-updated session cookie. A soft
            // router.push() can race with the Set-Cookie of the session update. When the update
            // did not land, the destination routes by the backend's onboarding state.
            window.location.href = destination;
        } catch {
            toast.error("An error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 w-full max-w-sm">
            <div className="space-y-2">
                <label
                    htmlFor="orgName"
                    className="block text-sm font-medium text-[var(--foreground)]"
                >
                    Organization Name
                </label>
                <input
                    id="orgName"
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md border-[var(--card-stroke)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-(--accent-2)"
                    placeholder="My Company"
                />
            </div>

            <button
                type="submit"
                disabled={loading || status !== "authenticated"}
                className="w-full py-2 px-4 bg-[var(--accent)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
            >
                {loading ? "Creating workspace..." : "Create Workspace"}
            </button>
        </form>
    );
}
