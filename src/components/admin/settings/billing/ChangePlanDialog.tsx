"use client";

import type { BillingPlanRecord } from "@/lib/billing/actions";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatAmount } from "./format";

type ChangePlanDialogProps = {
    isOpen: boolean;
    plans: BillingPlanRecord[];
    plansLoading: boolean;
    selectedPlanId: string | null;
    currentPlanName: string;
    isPending: boolean;
    onSelectPlan: (planId: string) => void;
    onClose: () => void;
    onConfirm: () => void;
};

export function ChangePlanDialog({
    isOpen,
    plans,
    plansLoading,
    selectedPlanId,
    currentPlanName,
    isPending,
    onSelectPlan,
    onClose,
    onConfirm,
}: ChangePlanDialogProps) {
    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-lg rounded-lg border border-(--card-stroke) bg-(--card-80) p-6 shadow-lg">
                <h3 className="text-lg font-semibold text-(--foreground)">Change Plan</h3>
                <p className="mt-1 text-sm text-(--ink-muted)">
                    Select the plan you want to switch to.
                </p>

                {plansLoading ? (
                    <div className="mt-6 flex items-center justify-center py-8">
                        <div className="size-6 animate-spin rounded-full border-2 border-(--accent) border-t-transparent" />
                    </div>
                ) : plans.length === 0 ? (
                    <p className="mt-6 text-center text-sm text-(--ink-muted)">
                        No plans available.
                    </p>
                ) : (
                    <div className="mt-4 grid gap-3">
                        {plans.map((plan) => {
                            const monthly = plan.prices.find(
                                (p) => p.interval === "monthly" && p.is_active,
                            );
                            const isSelected = selectedPlanId === plan.id;
                            const isCurrent =
                                currentPlanName !== "-" &&
                                plan.name.toLowerCase() === currentPlanName.toLowerCase();

                            return (
                                <button
                                    key={plan.id}
                                    type="button"
                                    onClick={() => onSelectPlan(plan.id)}
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
                                        <span className="text-sm font-semibold text-(--foreground)">
                                            {plan.name}
                                        </span>
                                        {isCurrent && (
                                            <span className="rounded-full bg-(--accent)/15 px-2 py-0.5 text-label-caps font-semibold uppercase text-(--accent)">
                                                Current
                                            </span>
                                        )}
                                    </div>
                                    {plan.description && (
                                        <p className="mt-1 text-xs text-(--ink-muted)">
                                            {plan.description}
                                        </p>
                                    )}
                                    <p className="mt-2 text-sm font-medium text-(--foreground)">
                                        {monthly
                                            ? formatAmount(monthly.amount, monthly.currency)
                                            : "Contact sales"}
                                        {monthly && (
                                            <span className="text-xs font-normal text-(--ink-muted)">
                                                {" "}
                                                / month
                                            </span>
                                        )}
                                    </p>
                                    {plan.bundles.length > 0 && (
                                        <ul className="mt-2 space-y-1">
                                            {plan.bundles
                                                .flatMap((b) => b.features)
                                                .slice(0, 4)
                                                .map((feat) => (
                                                    <li
                                                        key={feat}
                                                        className="text-xs text-(--ink-muted)"
                                                    >
                                                        • {feat}
                                                    </li>
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
                        onClick={onClose}
                        className="rounded-md border border-(--card-stroke) px-3 py-2 text-sm hover:bg-(--card) text-(--foreground)"
                    >
                        {CTA_LABELS.cancel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isPending || !selectedPlanId}
                        className="rounded-md bg-(--accent) px-3 py-2 text-sm text-white disabled:opacity-50"
                    >
                        {isPending ? "Switching…" : "Confirm Change"}
                    </button>
                </div>
            </div>
        </div>
    );
}
