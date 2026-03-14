"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getSubscription, getBillingPortalUrl } from "@/lib/billing/actions";
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
      const portalUrl = result.data.url;
      try {
        const parsed = new URL(portalUrl);
        if (parsed.protocol !== "https:") {
          toast.error("Invalid billing portal URL");
          setIsPending(false);
          return;
        }
      } catch {
        toast.error("Invalid billing portal URL");
        setIsPending(false);
        return;
      }
      window.location.href = portalUrl;
    }
  };

  return (
    <div
      className={`relative z-[90] flex w-full items-center justify-center gap-4 border-b px-4 py-3 text-sm shadow-xs ${
        isWarning
          ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-500"
          : "border-(--accent)/20 bg-(--accent)/10 text-(--accent)"
      }`}
    >
      <div className="flex items-center gap-2 font-medium">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        Your Team trial ends in {daysRemaining} {daysRemaining === 1 ? "day" : "days"}.
      </div>

      <button
        type="button"
        onClick={handleAddPayment}
        disabled={isPending}
        className="font-semibold underline underline-offset-2 transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        Add payment method &rarr;
      </button>

      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-4 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
        aria-label="Dismiss"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  );
}
