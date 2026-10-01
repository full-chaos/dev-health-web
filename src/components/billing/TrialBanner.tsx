"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getSubscription, getBillingPortalUrl } from "@/lib/billing/actions";
import { Notice } from "@/components/ui/Notice";
import { toast } from "sonner";

export function TrialBanner() {
    const { data: session } = useSession();
    const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isPending, setIsPending] = useState(false);

    useEffect(() => {
        if (!session?.user?.org_id) return;

        const storageKey = `trial-banner-dismissed-${session.user.org_id}`;
        const dismissedAt = localStorage.getItem(storageKey);
        const now = new Date();

        getSubscription().then((res) => {
            if (res.error || !res.data) return;
            if (res.data.status !== "trialing") return;

            const trialEnd = new Date(res.data.trial_end ?? "");
            if (isNaN(trialEnd.getTime())) return;

            const diffMs = trialEnd.getTime() - now.getTime();
            const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

            if (days < 0) return;

            setDaysRemaining(days);

            if (dismissedAt) {
                if (days <= 3) {
                    const dismissedDate = new Date(dismissedAt);
                    if (dismissedDate.toDateString() === now.toDateString()) {
                        return;
                    }
                } else {
                    return;
                }
            }

            setIsVisible(true);
        });
    }, [session?.user?.org_id]);

    if (!isVisible || daysRemaining === null) return null;

    const isWarning = daysRemaining <= 3;

    const handleDismiss = () => {
        if (session?.user?.org_id) {
            const storageKey = `trial-banner-dismissed-${session.user.org_id}`;
            localStorage.setItem(storageKey, new Date().toISOString());
        }
        setIsVisible(false);
    };

    const handleAddPayment = async () => {
        setIsPending(true);
        const result = await getBillingPortalUrl();
        if (result.error) {
            toast.error(result.error);
            setIsPending(false);
            return;
        }
        if (result.data) {
            const ALLOWED_HOSTS = ["billing.stripe.com", "checkout.stripe.com"];
            let safeUrl: string | null = null;
            try {
                const parsed = new URL(result.data.url);
                if (parsed.protocol === "https:" && ALLOWED_HOSTS.includes(parsed.hostname)) {
                    safeUrl = parsed.href;
                }
            } catch {
                /* invalid URL — leave safeUrl null */
            }

            if (!safeUrl) {
                toast.error("Unexpected billing portal URL");
                setIsPending(false);
                return;
            }
            window.location.href = safeUrl;
        }
    };

    return (
        <Notice
            variant={isWarning ? "warn" : "info"}
            live={false}
            centered
            className="relative z-[90] w-full rounded-none border-x-0 border-t-0"
            title={`Your Team trial ends in ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}.`}
            action={
                <button
                    type="button"
                    onClick={handleAddPayment}
                    disabled={isPending}
                    className="font-semibold underline underline-offset-2 transition-opacity hover:opacity-80 disabled:opacity-50"
                >
                    Add payment method &rarr;
                </button>
            }
            onDismiss={handleDismiss}
        />
    );
}
