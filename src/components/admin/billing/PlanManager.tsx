"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createBillingPlan,
  deleteBillingPlan,
  syncBillingPlanToStripe,
  updateBillingPlan,
  type BillingPlanRecord,
  type BillingPriceInput,
} from "@/lib/billing/actions";

type PlanManagerProps = {
  initialPlans: BillingPlanRecord[];
};

type PlanFormState = {
  key: string;
  name: string;
  tier: string;
  description: string;
  display_order: string;
  is_active: boolean;
  bundle_ids_csv: string;
  prices_json: string;
};

const DEFAULT_FORM: PlanFormState = {
  key: "",
  name: "",
  tier: "team",
  description: "",
  display_order: "0",
  is_active: true,
  bundle_ids_csv: "",
  prices_json: "[]",
};

function mapPlanToForm(plan: BillingPlanRecord): PlanFormState {
  return {
    key: plan.key,
    name: plan.name,
    tier: plan.tier,
    description: plan.description ?? "",
    display_order: String(plan.display_order),
    is_active: plan.is_active,
    bundle_ids_csv: plan.bundles.map((bundle) => bundle.id).join(", "),
    prices_json: JSON.stringify(
      plan.prices.map((price) => ({
        interval: price.interval,
        amount: price.amount,
        currency: price.currency,
        is_active: price.is_active,
      })),
      null,
      2
    ),
  };
}

function parsePriceJson(input: string): BillingPriceInput[] {
  const parsed = JSON.parse(input) as BillingPriceInput[];
  if (!Array.isArray(parsed)) {
    throw new Error("Prices JSON must be an array");
  }
  return parsed;
}

export function PlanManager({ initialPlans }: PlanManagerProps) {
  const [plans, setPlans] = useState(initialPlans);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [formState, setFormState] = useState<PlanFormState>(DEFAULT_FORM);
  const [isPending, startTransition] = useTransition();

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)),
    [plans]
  );

  const resetForm = () => {
    setEditingPlanId(null);
    setFormState(DEFAULT_FORM);
  };

  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    startTransition(async () => {
      let prices: BillingPriceInput[] = [];
      try {
        prices = parsePriceJson(formState.prices_json);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Invalid prices JSON");
        return;
      }

      const payload = {
        key: formState.key.trim(),
        name: formState.name.trim(),
        tier: formState.tier.trim(),
        description: formState.description.trim() || null,
        display_order: Number(formState.display_order || "0"),
        is_active: formState.is_active,
        prices,
        bundle_ids: formState.bundle_ids_csv
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      };

      const result = editingPlanId
        ? await updateBillingPlan(editingPlanId, payload)
        : await createBillingPlan(payload);

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      const nextPlan = result.data;
      setPlans((current) => {
        const existingIndex = current.findIndex((plan) => plan.id === nextPlan.id);
        if (existingIndex === -1) {
          return [...current, nextPlan];
        }
        const updated = [...current];
        updated[existingIndex] = nextPlan;
        return updated;
      });
      toast.success(editingPlanId ? "Plan updated" : "Plan created");
      resetForm();
    });
  };

  const onDelete = (planId: string) => {
    startTransition(async () => {
      const result = await deleteBillingPlan(planId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setPlans((current) => current.map((plan) => (plan.id === planId ? { ...plan, is_active: false } : plan)));
      toast.success("Plan archived");
    });
  };

  const onSync = (planId: string) => {
    startTransition(async () => {
      const result = await syncBillingPlanToStripe(planId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setPlans((current) => current.map((plan) => (plan.id === planId ? result.data : plan)));
      toast.success("Plan synced to Stripe");
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-(--font-display) text-xl">Plan Editor</h2>
          {editingPlanId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-(--card-stroke) px-3 py-1.5 text-xs uppercase tracking-widest text-(--ink-muted)"
            >
              Cancel edit
            </button>
          )}
        </div>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <input
            value={formState.name}
            onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
            placeholder="Plan name"
            className="rounded-lg border border-(--card-stroke) bg-(--card) px-3 py-2 text-sm"
            required
          />
          <input
            value={formState.key}
            onChange={(event) => setFormState((current) => ({ ...current, key: event.target.value }))}
            placeholder="Plan key"
            className="rounded-lg border border-(--card-stroke) bg-(--card) px-3 py-2 text-sm"
            required
          />
          <input
            value={formState.tier}
            onChange={(event) => setFormState((current) => ({ ...current, tier: event.target.value }))}
            placeholder="Tier"
            className="rounded-lg border border-(--card-stroke) bg-(--card) px-3 py-2 text-sm"
            required
          />
          <input
            type="number"
            value={formState.display_order}
            onChange={(event) => setFormState((current) => ({ ...current, display_order: event.target.value }))}
            placeholder="Display order"
            className="rounded-lg border border-(--card-stroke) bg-(--card) px-3 py-2 text-sm"
          />
          <input
            value={formState.description}
            onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
            placeholder="Description"
            className="rounded-lg border border-(--card-stroke) bg-(--card) px-3 py-2 text-sm md:col-span-2"
          />
          <input
            value={formState.bundle_ids_csv}
            onChange={(event) => setFormState((current) => ({ ...current, bundle_ids_csv: event.target.value }))}
            placeholder="Bundle IDs (comma-separated)"
            className="rounded-lg border border-(--card-stroke) bg-(--card) px-3 py-2 text-sm md:col-span-2"
          />
          <textarea
            value={formState.prices_json}
            onChange={(event) => setFormState((current) => ({ ...current, prices_json: event.target.value }))}
            placeholder='[{"interval":"monthly","amount":4900,"currency":"usd"}]'
            rows={8}
            className="rounded-lg border border-(--card-stroke) bg-(--card) px-3 py-2 text-sm font-(--font-mono) md:col-span-2"
          />
          <label className="flex items-center gap-2 text-sm text-(--ink-muted)">
            <input
              type="checkbox"
              checked={formState.is_active}
              onChange={(event) => setFormState((current) => ({ ...current, is_active: event.target.checked }))}
            />
            Active plan
          </label>
          <div className="flex justify-end md:col-span-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {editingPlanId ? "Save changes" : "Create plan"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
        <h2 className="mb-4 font-(--font-display) text-xl">Plans</h2>
        <div className="space-y-4">
          {sortedPlans.map((plan) => (
            <article key={plan.id} className="rounded-xl border border-(--card-stroke) bg-(--card) p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-(--ink-muted)">{plan.key}</p>
                  <h3 className="font-(--font-display) text-lg">{plan.name}</h3>
                  <p className="text-sm text-(--ink-muted)">{plan.description ?? "No description"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPlanId(plan.id);
                      setFormState(mapPlanToForm(plan));
                    }}
                    className="rounded-lg border border-(--card-stroke) px-3 py-1.5 text-xs uppercase tracking-widest text-(--ink-muted)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onSync(plan.id)}
                    className="rounded-lg border border-(--card-stroke) px-3 py-1.5 text-xs uppercase tracking-widest text-(--ink-muted)"
                  >
                    Sync Stripe
                  </button>
                  {plan.is_active && (
                    <button
                      type="button"
                      onClick={() => onDelete(plan.id)}
                      className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs uppercase tracking-widest text-red-500"
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 text-xs text-(--ink-muted)">
                Tier: {plan.tier} | Order: {plan.display_order} | Status: {plan.is_active ? "active" : "inactive"}
              </div>
              <div className="mt-3 text-xs text-(--ink-muted)">
                Stripe product: {plan.stripe_product_id ?? "not synced"}
              </div>

              <div className="mt-3 space-y-1 text-sm text-(--ink-muted)">
                {plan.prices.map((price) => (
                  <p key={price.id}>
                    {price.interval}: {(price.amount / 100).toLocaleString("en-US", { style: "currency", currency: price.currency.toUpperCase(), maximumFractionDigits: 0 })}
                    {price.stripe_price_id ? ` (${price.stripe_price_id})` : ""}
                  </p>
                ))}
                {plan.prices.length === 0 && <p>No prices configured</p>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
