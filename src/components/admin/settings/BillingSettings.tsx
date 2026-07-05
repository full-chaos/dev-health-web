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
import { CancelSubscriptionDialog } from "./CancelSubscriptionDialog";
import { ChangePlanDialog } from "./billing/ChangePlanDialog";
import { SubscriptionHistoryList } from "./billing/SubscriptionHistoryList";
import { TrialStatusBanner } from "./billing/TrialStatusBanner";
import { SubscriptionSummaryCard } from "./billing/SubscriptionSummaryCard";
import { formatDate, pickString } from "./billing/format";

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

export function BillingSettings({ tier = "community" }: BillingSettingsProps) {
    const [isPending, startTransition] = useTransition();
    const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
    const [history, setHistory] = useState<SubscriptionHistoryItem[]>([]);
    const [showPlanModal, setShowPlanModal] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
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
        ? (STATUS_COLORS[subscription.status] ?? "bg-zinc-500/15 text-zinc-700")
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
                if (
                    !historyRes.error?.includes("No active subscription") &&
                    !historyRes.error?.includes("not found")
                ) {
                    toast.error(historyRes.error);
                }
            } else {
                setHistory(historyRes.data.items);
            }

            setLoaded(true);
        });
    }, []);

    useEffect(() => {
        load();
    }, [load]);

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

    const onConfirmCancelPeriodEnd = () => {
        setShowCancelModal(false);
        onCancel(false);
    };

    const onConfirmCancelImmediate = () => {
        setShowCancelModal(false);
        onCancel(true);
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
    const periodEndLabel = formatDate(subscription?.current_period_end ?? null);

    const primaryActionLabel = isFree ? "Start free trial" : "Change Plan";
    const onPrimaryAction = isFree
        ? () => {
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
          }
        : openPlanModal;

    const trialBanner =
        isTrialing && subscription?.trial_end ? (
            <TrialStatusBanner
                isTrialWarning={isTrialWarning}
                trialDaysRemaining={trialDaysRemaining}
                trialProgress={trialProgress}
                trialEndLabel={formatDate(subscription.trial_end)}
            />
        ) : null;

    return (
        <SettingsSection title="Billing" description="Manage your subscription and history.">
            <SubscriptionSummaryCard
                planName={planName}
                statusClass={statusClass}
                statusLabel={statusLabel}
                hasSubscription={hasSubscription}
                amount={amount}
                interval={interval}
                periodStartLabel={formatDate(subscription?.current_period_start ?? null)}
                periodEndLabel={periodEndLabel}
                loaded={loaded}
                trialBanner={trialBanner}
                isPending={isPending}
                primaryActionLabel={primaryActionLabel}
                onPrimaryAction={onPrimaryAction}
                onCancelClick={() => setShowCancelModal(true)}
                showReactivate={Boolean(subscription?.cancel_at_period_end)}
                onReactivate={onReactivate}
            />

            <SubscriptionHistoryList history={history} />

            <ChangePlanDialog
                isOpen={showPlanModal}
                plans={plans}
                plansLoading={plansLoading}
                selectedPlanId={selectedPlanId}
                currentPlanName={planName}
                isPending={isPending}
                onSelectPlan={setSelectedPlanId}
                onClose={() => setShowPlanModal(false)}
                onConfirm={onChangePlan}
            />

            <CancelSubscriptionDialog
                isOpen={showCancelModal}
                periodEndLabel={periodEndLabel}
                isPending={isPending}
                onDismiss={() => setShowCancelModal(false)}
                onConfirmPeriodEnd={onConfirmCancelPeriodEnd}
                onConfirmImmediate={onConfirmCancelImmediate}
            />
        </SettingsSection>
    );
}
