"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { SettingsSection } from "./SettingsSection";
import {
  createCheckoutSession,
  createPortalSession,
  getSubscriptionDetails,
  type SubscriptionDetails,
} from "@/lib/billing/actions";

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
  const [subscriptionResult, setSubscriptionResult] = useState<{
    data?: SubscriptionDetails;
    error?: string;
  } | null>(null);
  const [selectedTier, setSelectedTier] = useState<"team" | "enterprise" | null>(null);
  const [dismissed, setDismissed] = useState<"success" | "cancelled" | null>(null);

  const billingParam = searchParams.get("billing");
  const showSuccess = useMemo(() => billingParam === "success" && dismissed !== "success", [billingParam, dismissed]);
  const showCancelled = useMemo(() => billingParam === "cancelled" && dismissed !== "cancelled", [billingParam, dismissed]);

  const subscription = subscriptionResult?.data;
  const subscriptionError = subscriptionResult?.error ?? null;
  const errorMessage = error ?? subscriptionError;
  const currentTier = subscription?.tier ?? tier;
  const tierLabel = TIER_LABELS[currentTier] ?? currentTier;
  const canUpgrade = currentTier !== "enterprise";
  const isPaidTier = currentTier === "team" || currentTier === "enterprise";
  const subscriptionStatus = subscription?.status ?? "unknown";

  const statusMeta = useMemo(() => {
    if (!subscription) return null;
    switch (subscriptionStatus) {
      case "active":
        return {
          label: "Active",
          className: "bg-(--accent-2)/10 text-(--accent-2)",
          dotClassName: "bg-(--accent-2)",
        };
      case "past_due":
        return {
          label: "Past Due",
          className: "bg-amber-500/10 text-amber-500",
          dotClassName: null,
        };
      case "canceled":
        return {
          label: "Canceled",
          className: "bg-red-500/10 text-red-500",
          dotClassName: null,
        };
      case "trialing":
        return {
          label: "Trialing",
          className: "bg-(--accent-2)/10 text-(--accent-2)",
          dotClassName: "bg-(--accent-2)",
        };
      default:
        return null;
    }
  }, [subscription, subscriptionStatus]);

  const nextBillingDate = useMemo(() => {
    const periodEnd = subscription?.current_period_end;
    if (!periodEnd) return null;
    const date = new Date(periodEnd);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }, [subscription]);

  const limits = subscription?.limits ?? {};
  const usersLimit =
    typeof limits.users === "number"
      ? limits.users
      : typeof limits.seats === "number"
        ? limits.seats
        : undefined;
  const reposLimit =
    typeof limits.repos === "number"
      ? limits.repos
      : typeof limits.repositories === "number"
        ? limits.repositories
        : undefined;
  const apiRateLimit =
    typeof limits.api_rate === "number"
      ? limits.api_rate
      : typeof limits.api_rate_per_minute === "number"
        ? limits.api_rate_per_minute
        : typeof limits.api_rate_limit === "number"
          ? limits.api_rate_limit
          : undefined;

  const formatLimitValue = (value?: number) => {
    if (value === -1) return "Unlimited";
    if (typeof value !== "number") return "—";
    return `${value}`;
  };

  const formatLimitPair = (value?: number) => {
    const formatted = formatLimitValue(value);
    if (formatted === "Unlimited" || formatted === "—") return formatted;
    return `${formatted} / ${formatted}`;
  };

  const apiRateLabel = useMemo(() => {
    if (apiRateLimit === -1) return "Unlimited";
    if (typeof apiRateLimit !== "number") return "—";
    return `${apiRateLimit}/min`;
  }, [apiRateLimit]);

  useEffect(() => {
    let isActive = true;

    const loadSubscription = async () => {
      const result = await getSubscriptionDetails();
      if (!isActive) return;
      startTransition(() => {
        setSubscriptionResult(result);
      });
    };

    loadSubscription();

    return () => {
      isActive = false;
    };
  }, []);

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

      {errorMessage && (
        <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border border-(--card-stroke) bg-(--background) p-4">
        <div>
          <p className="text-sm font-medium text-(--foreground)">Current Plan</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <p className="text-2xl font-bold text-(--foreground)">{tierLabel}</p>
            {statusMeta && (
              <span
                className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}
              >
                {statusMeta.dotClassName && (
                  <span className={`h-2 w-2 rounded-full ${statusMeta.dotClassName}`} />
                )}
                {statusMeta.label}
              </span>
            )}
          </div>
          {nextBillingDate && (
            <p className="mt-2 text-sm text-(--ink-muted)">
              Next billing date: <span className="font-medium text-(--foreground)">{nextBillingDate}</span>
            </p>
          )}
          {subscription && (
            <div className="mt-3 grid gap-3 text-sm text-(--ink-muted) sm:grid-cols-3">
              <div>
                <span className="font-medium text-(--foreground)">Users:</span>{" "}
                {formatLimitPair(usersLimit)}
              </div>
              <div>
                <span className="font-medium text-(--foreground)">Repos:</span>{" "}
                {formatLimitPair(reposLimit)}
              </div>
              <div>
                <span className="font-medium text-(--foreground)">API Rate:</span>{" "}
                {apiRateLabel}
              </div>
            </div>
          )}
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
            {currentTier !== "team" && (
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
        {currentTier === "community" || currentTier === "free" ? (
          <p>Upgrade to unlock more features.</p>
        ) : (
          <p>Contact support for billing inquiries.</p>
        )}
      </div>
    </SettingsSection>
  );
}
