"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  cancelSubscription,
  changePlan,
  getSubscription,
  getSubscriptionHistory,
  listBillingPlans,
  reactivateSubscription,
  startTrialCheckout,
  type BillingPlanRecord,
  type SubscriptionDetails,
  type SubscriptionHistoryItem,
} from "@/lib/billing/actions";

import { SettingsSection } from "./SettingsSection";

type BillingSettingsProps = {
  tier?: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-700",
  past_due: "bg-yellow-500/15 text-yellow-700",
  canceled: "bg-red-500/15 text-red-700",
  trialing: "bg-blue-500/15 text-blue-700",
  incomplete: "bg-zinc-500/15 text-zinc-700",
};

function pickString(record: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!record) {
    return "-";
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return "-";
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString();
}

function formatAmount(amountInCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(amountInCents / 100);
}

export function BillingSettings({ tier = "community" }: BillingSettingsProps) {
  const [isPending, startTransition] = useTransition();
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [history, setHistory] = useState<SubscriptionHistoryItem[]>([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [plans, setPlans] = useState<BillingPlanRecord[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const hasSubscription = subscription !== null;
  const isFree = !hasSubscription;
  const isTrialing = subscription?.status === "trialing";
  const [now] = useState(() => Date.now());

  let trialDaysRemaining = 0;
  let trialProgress = 0;
  let isTrialWarning = false;

  if (isTrialing && subscription?.trial_end && subscription?.trial_start) {
    const trialEnd = new Date(subscription.trial_end).getTime();
    const trialStart = new Date(subscription.trial_start).getTime();
    
    trialDaysRemaining = Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)));
    isTrialWarning = trialDaysRemaining <= 3;
    
    const totalMs = Math.max(1, trialEnd - trialStart);
    const elapsedMs = Math.max(0, now - trialStart);
    trialProgress = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  }

  const statusClass = hasSubscription
    ? STATUS_COLORS[subscription.status] ?? "bg-zinc-500/15 text-zinc-700"
    : "bg-green-500/15 text-green-700";

  const statusLabel = useMemo(() => {
    if (!hasSubscription) return "Free";
    const value = subscription.status;
    return value.replace("_", " ");
  }, [hasSubscription, subscription?.status]);

  const load = useCallback(() => {
    startTransition(async () => {
      const [subRes, historyRes] = await Promise.all([
        getSubscription(),
        getSubscriptionHistory(25, 0),
      ]);

      if ("error" in subRes) {
        // 404 is expected for free-tier users with no Stripe subscription
        // Only toast on unexpected errors
        if (!subRes.error?.includes("No active subscription")) {
          toast.error(subRes.error);
        }
      } else {
        setSubscription(subRes.data);
      }

      if ("error" in historyRes) {
        // History may also 404 for free-tier — silently ignore
        if (!historyRes.error?.includes("No active subscription") && !historyRes.error?.includes("not found")) {
          toast.error(historyRes.error);
        }
      } else {
        setHistory(historyRes.data.items);
      }

      setLoaded(true);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const openPlanModal = () => {
    setPlansLoading(true);
    setSelectedPlanId(null);
    setShowPlanModal(true);
    startTransition(async () => {
      const result = await listBillingPlans();
      if (result.error) {
        toast.error(result.error);
        setPlansLoading(false);
        return;
      }
      setPlans((result.data ?? []).filter((p) => p.is_active));
      setPlansLoading(false);
    });
  };

  const onChangePlan = () => {
    if (!selectedPlanId) {
      toast.error("Select a plan");
      return;
    }

    const plan = plans.find((p) => p.id === selectedPlanId);
    const monthlyPrice = plan?.prices.find((p) => p.interval === "monthly" && p.is_active);
    const priceId = monthlyPrice?.stripe_price_id;

    if (!priceId) {
      toast.error("Selected plan has no active Stripe price configured");
      return;
    }

    startTransition(async () => {
      const result = await changePlan(priceId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Plan change requested");
      setShowPlanModal(false);
      load();
    });
  };

  const onCancel = (immediately: boolean) => {
    startTransition(async () => {
      const result = await cancelSubscription(immediately);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(immediately ? "Subscription canceled" : "Cancellation scheduled");
      load();
    });
  };

  const onReactivate = () => {
    startTransition(async () => {
      const result = await reactivateSubscription();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Subscription reactivated");
      load();
    });
  };

  const interval = pickString(subscription?.price, ["interval", "billing_interval"]);
  const amount = pickString(subscription?.price, ["display_amount", "amount", "unit_amount"]);
  const planName = hasSubscription
    ? pickString(subscription.plan, ["name", "key", "slug", "code"])
    : tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <SettingsSection title="Billing" description="Manage your subscription and history.">
      <div className="rounded-md border border-(--card-stroke) bg-(--background) p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm text-(--ink-muted)">Current Plan</p>
            <p className="text-2xl font-semibold text-(--foreground)">{planName}</p>
            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusClass}`}>
              {statusLabel}
            </span>
            {hasSubscription ? (
              <>
                <p className="text-sm text-(--ink-muted)">Price: {amount} / {interval}</p>
                <p className="text-sm text-(--ink-muted)">
                  Period: {formatDate(subscription.current_period_start ?? null)} - {formatDate(subscription.current_period_end ?? null)}
                </p>

                {isTrialing && subscription.trial_end && (
                  <div className={`mt-4 max-w-sm rounded-lg border p-4 ${
                    isTrialWarning
                      ? "border-amber-500/30 bg-amber-500/10"
                      : "border-(--card-stroke) bg-(--card-80)"
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-(--ink-muted)">Trial Status</span>
                      <span className={`text-xl font-bold ${
                        isTrialWarning ? "text-amber-600 dark:text-amber-500" : "text-(--foreground)"
                      }`}>
                        {trialDaysRemaining} days left
                      </span>
                    </div>
                    
                    <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          isTrialWarning ? "bg-amber-500" : "bg-(--accent)"
                        }`}
                        style={{ width: `${trialProgress}%` }}
                      />
                    </div>
                    
                    <p className="mt-2 text-xs text-(--ink-muted)">
                      Ends on {formatDate(subscription.trial_end)}
                    </p>
                  </div>
                )}
              </>
            ) : loaded ? (
              <p className="text-sm text-(--ink-muted)">No billing — upgrade to unlock paid features.</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={isFree ? () => {
                startTransition(async () => {
                  const result = await startTrialCheckout();
                  if (result.error) {
                    toast.error(result.error);
                    return;
                  }
                  if (result.data?.url) {
                    window.location.href = result.data.url;
                  }
                });
              } : openPlanModal}
              disabled={isPending}
              className="rounded-md border border-(--card-stroke) px-3 py-2 text-sm hover:bg-(--card) disabled:opacity-50"
            >
              {isFree ? "Start free trial" : "Change Plan"}
            </button>
            {hasSubscription && (
              <button
                type="button"
                onClick={() => {
                  const ok = window.confirm("Cancel at period end? Click Cancel for immediate cancellation.");
                  onCancel(!ok);
                }}
                disabled={isPending}
                className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            {subscription?.cancel_at_period_end && (
              <button
                type="button"
                onClick={onReactivate}
                disabled={isPending}
                className="rounded-md border border-blue-300 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                Reactivate
              </button>
            )}
          </div>
        </div>
      </div>

      <details className="mt-4 rounded-md border border-(--card-stroke) bg-(--background) p-4">
        <summary className="cursor-pointer text-sm font-semibold text-(--foreground)">
          Subscription History ({history.length})
        </summary>
        <ul className="mt-3 space-y-3">
          {history.map((item) => (
            <li key={item.id} className="rounded-md border border-(--card-stroke) p-3">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-(--foreground)">{item.event_type}</span>
                <span className="text-(--ink-muted)">{formatDate(item.processed_at)}</span>
              </div>
              <p className="mt-1 text-xs text-(--ink-muted)">
                {item.previous_status ?? "-"}{" -> "}{item.new_status}
              </p>
            </li>
          ))}
        </ul>
      </details>

      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-lg border border-(--card-stroke) bg-(--card-80) p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-(--foreground)">Change Plan</h3>
            <p className="mt-1 text-sm text-(--ink-muted)">Select the plan you want to switch to.</p>

            {plansLoading ? (
              <div className="mt-6 flex items-center justify-center py-8">
                <div className="size-6 animate-spin rounded-full border-2 border-(--accent) border-t-transparent" />
              </div>
            ) : plans.length === 0 ? (
              <p className="mt-6 text-center text-sm text-(--ink-muted)">No plans available.</p>
            ) : (
              <div className="mt-4 grid gap-3">
                {plans.map((plan) => {
                  const monthly = plan.prices.find((p) => p.interval === "monthly" && p.is_active);
                  const isSelected = selectedPlanId === plan.id;
                  const isCurrent = planName !== "-" && plan.name.toLowerCase() === planName.toLowerCase();

                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      disabled={isCurrent}
                      className={`rounded-md border p-4 text-left transition ${
                        isSelected
                          ? "border-(--accent) bg-(--accent)/10 ring-1 ring-(--accent)"
                          : isCurrent
                            ? "border-(--card-stroke) bg-(--card-70) opacity-60 cursor-not-allowed"
                            : "border-(--card-stroke) hover:border-(--accent)/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-(--foreground)">{plan.name}</span>
                        {isCurrent && (
                          <span className="rounded-full bg-(--accent)/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-(--accent)">
                            Current
                          </span>
                        )}
                      </div>
                      {plan.description && (
                        <p className="mt-1 text-xs text-(--ink-muted)">{plan.description}</p>
                      )}
                      <p className="mt-2 text-sm font-medium text-(--foreground)">
                        {monthly ? formatAmount(monthly.amount, monthly.currency) : "Contact sales"}
                        {monthly && <span className="text-xs font-normal text-(--ink-muted)"> / month</span>}
                      </p>
                      {plan.bundles.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {plan.bundles.flatMap((b) => b.features).slice(0, 4).map((feat) => (
                            <li key={feat} className="text-xs text-(--ink-muted)">• {feat}</li>
                          ))}
                        </ul>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPlanModal(false)}
                className="rounded-md border border-(--card-stroke) px-3 py-2 text-sm hover:bg-(--card) text-(--foreground)"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onChangePlan}
                disabled={isPending || !selectedPlanId}
                className="rounded-md bg-(--accent) px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {isPending ? "Switching…" : "Confirm Change"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
