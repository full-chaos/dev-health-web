"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { resolveOrigin } from "@/lib/origin";
import { extractErrorMessage } from "@/lib/errorMessages";
import { trackOnboardingEvent } from "@/lib/onboarding/track";

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
    const { data: session, update, status } = useSession();
    const [orgName, setOrgName] = useState("");
    const [loading, setLoading] = useState(false);
    const isTeamTrialIntent = trialIntent && plan?.toLowerCase() === "team";

    useEffect(() => {
        if (guided) {
            trackOnboardingEvent("workspace_setup_started");
        }
    }, [guided]);

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const backendUrl = resolveOrigin();
            const res = await fetch(`${backendUrl}/api/v1/auth/onboard`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                    action: "create_org",
                    org_name: orgName || undefined,
                }),
            });

            if (!res.ok) {
                if (res.status === 429) {
                    toast.error("Too many requests. Please try again later.");
                    return;
                }
                try {
                    const data = await res.json();
                    toast.error(extractErrorMessage(data.detail, "Failed to create workspace"));
                } catch {
                    toast.error("Failed to create workspace");
                }
                return;
            }

            const data = await res.json();

            if (guided) {
                trackOnboardingEvent("workspace_created", { orgId: data.org_id ?? null });
            }

            const onboardingSession = {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                org_id: data.org_id,
                role: data.role,
                expires_in: data.expires_in,
            };

            let sessionReady = false;

            for (let attempt = 0; attempt < 5 && !sessionReady; attempt += 1) {
                try {
                    const result = await update({ onboardComplete: onboardingSession });
                    if (result) {
                        sessionReady = true;
                    } else {
                        await delay(300 * (attempt + 1));
                    }
                } catch {
                    await delay(300 * (attempt + 1));
                }
            }

            const destination = isTeamTrialIntent
                ? "/auth/trial-checkout?plan=team&trial=true"
                : guided
                  ? "/auth/onboard/integration"
                  : "/dashboard";

            if (!sessionReady) {
                window.location.href = destination;
                return;
            }

            // Hard navigation ensures the middleware reads the freshly-updated session
            // cookie. A soft router.push() can race with the Set-Cookie from the
            // session update, causing the org-scoped guard to redirect back here.
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
                    className="w-full px-3 py-2 border rounded-md border-[var(--card-stroke)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
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
