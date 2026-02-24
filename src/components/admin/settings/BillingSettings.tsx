"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  cancelSubscription,
  changePlan,
  getSubscription,
  getSubscriptionHistory,
  reactivateSubscription,
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

export function BillingSettings({ tier = "community" }: BillingSettingsProps) {
  const [isPending, startTransition] = useTransition();
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null);
  const [history, setHistory] = useState<SubscriptionHistoryItem[]>([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [priceId, setPriceId] = useState("");

  const statusClass = STATUS_COLORS[subscription?.status ?? ""] ?? "bg-zinc-500/15 text-zinc-700";

  const statusLabel = useMemo(() => {
    const value = subscription?.status;
    if (!value) {
      return "Unknown";
    }
    return value.replace("_", " ");
  }, [subscription?.status]);

  const load = useCallback(() => {
    startTransition(async () => {
      const [subRes, historyRes] = await Promise.all([
        getSubscription(),
        getSubscriptionHistory(25, 0),
      ]);

      if ("error" in subRes) {
        toast.error(subRes.error);
      } else {
        setSubscription(subRes.data);
      }

      if ("error" in historyRes) {
        toast.error(historyRes.error);
      } else {
        setHistory(historyRes.data.items);
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onChangePlan = () => {
    if (!priceId) {
      toast.error("Enter a Stripe price ID");
      return;
    }

    startTransition(async () => {
      const result = await changePlan(priceId.trim());
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
  const planName = pickString(subscription?.plan, ["name", "key", "slug", "code"]);

  return (
    <SettingsSection title="Billing" description="Manage your subscription and history.">
      <div className="rounded-md border border-(--card-stroke) bg-(--background) p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm text-(--ink-muted)">Current Plan</p>
            <p className="text-2xl font-semibold text-(--foreground)">{planName === "-" ? tier : planName}</p>
            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusClass}`}>
              {statusLabel}
            </span>
            <p className="text-sm text-(--ink-muted)">Price: {amount} / {interval}</p>
            <p className="text-sm text-(--ink-muted)">
              Period: {formatDate(subscription?.current_period_start ?? null)} - {formatDate(subscription?.current_period_end ?? null)}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowPlanModal(true)}
              disabled={isPending}
              className="rounded-md border border-(--card-stroke) px-3 py-2 text-sm hover:bg-(--card) disabled:opacity-50"
            >
              Change Plan
            </button>
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
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold">Change Plan</h3>
            <p className="mt-1 text-sm text-zinc-600">Enter Stripe price ID for the target plan.</p>
            <input
              value={priceId}
              onChange={(event) => setPriceId(event.target.value)}
              placeholder="price_..."
              className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPlanModal(false)}
                className="rounded-md border px-3 py-2 text-sm"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onChangePlan}
                disabled={isPending}
                className="rounded-md bg-(--accent) px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
