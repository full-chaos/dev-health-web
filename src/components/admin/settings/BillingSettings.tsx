"use client";

import { useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { SettingsSection } from "./SettingsSection";
import { createCheckoutSession, createPortalSession } from "@/lib/billing/actions";

const TIER_LABELS: Record<string, string> = {
  community: "Community",
  free: "Community",
  team: "Team",
  enterprise: "Enterprise",
};

type BillingSettingsProps = {
  tier?: string;
};

export function BillingSettings({ tier = "community" }: BillingSettingsProps) {
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<"team" | "enterprise" | null>(null);
  const [dismissed, setDismissed] = useState<"success" | "cancelled" | null>(null);

  const billingParam = searchParams.get("billing");
  const showSuccess = useMemo(() => billingParam === "success" && dismissed !== "success", [billingParam, dismissed]);
  const showCancelled = useMemo(() => billingParam === "cancelled" && dismissed !== "cancelled", [billingParam, dismissed]);

  const tierLabel = TIER_LABELS[tier] ?? tier;
  const canUpgrade = tier !== "enterprise";
  const isPaidTier = tier === "team" || tier === "enterprise";

  const handleUpgrade = () => {
    if (!selectedTier) return;
    setError(null);

    startTransition(async () => {
      const result = await createCheckoutSession(selectedTier);
      if (result.error) {
        setError(result.error);
      } else if (result.data?.checkout_url) {
        window.location.href = result.data.checkout_url;
      }
    });
  };

  const handleManageBilling = () => {
    setError(null);

    startTransition(async () => {
      const result = await createPortalSession();
      if (result.error) {
        setError(result.error);
      } else if (result.data?.portal_url) {
        window.location.href = result.data.portal_url;
      }
    });
  };

  return (
    <SettingsSection
      title="Billing"
      description="Manage your subscription and billing details."
    >
      {showSuccess && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-green-500/20 bg-green-500/10 p-4 text-green-700">
          <p className="text-sm font-medium">Your plan has been upgraded successfully!</p>
          <button
            type="button"
            onClick={() => setDismissed("success")}
            className="ml-4 text-sm font-medium hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {showCancelled && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/10 p-4 text-amber-700">
          <p className="text-sm font-medium">Checkout was cancelled. No changes were made.</p>
          <button
            type="button"
            onClick={() => setDismissed("cancelled")}
            className="ml-4 text-sm font-medium hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border border-(--card-stroke) bg-(--background) p-4">
        <div>
          <p className="text-sm font-medium text-(--foreground)">Current Plan</p>
          <p className="text-2xl font-bold text-(--foreground)">{tierLabel}</p>
        </div>
        {isPaidTier && (
          <button
            type="button"
            onClick={handleManageBilling}
            disabled={isPending}
            className="rounded-md border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--foreground) hover:bg-(--card) disabled:opacity-50"
          >
            {isPending ? "Loading..." : "Manage Billing"}
          </button>
        )}
      </div>

      {canUpgrade && (
        <div className="mt-6 space-y-4">
          <h3 className="text-lg font-medium text-(--foreground)">Upgrade Plan</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {tier !== "team" && (
              <button
                type="button"
                onClick={() => setSelectedTier("team")}
                className={`relative flex cursor-pointer flex-col rounded-lg border p-4 text-left shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2 ${
                  selectedTier === "team"
                    ? "border-(--accent) ring-1 ring-(--accent)"
                    : "border-(--card-stroke) hover:border-(--accent)/50"
                }`}
              >
                <span className="text-base font-semibold text-(--foreground)">Team</span>
                <span className="mt-1 text-sm text-(--ink-muted)">
                  Advanced insights, team metrics, capacity planning
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedTier("enterprise")}
              className={`relative flex cursor-pointer flex-col rounded-lg border p-4 text-left shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2 ${
                selectedTier === "enterprise"
                  ? "border-(--accent) ring-1 ring-(--accent)"
                  : "border-(--card-stroke) hover:border-(--accent)/50"
              }`}
            >
              <span className="text-base font-semibold text-(--foreground)">Enterprise</span>
              <span className="mt-1 text-sm text-(--ink-muted)">
                SSO, dedicated support, custom integrations
              </span>
            </button>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={!selectedTier || isPending}
              className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Processing..." : "Upgrade Plan"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 text-sm text-(--ink-muted)">
        {tier === "community" || tier === "free" ? (
          <p>Upgrade to unlock more features.</p>
        ) : (
          <p>Contact support for billing inquiries.</p>
        )}
      </div>
    </SettingsSection>
  );
}
