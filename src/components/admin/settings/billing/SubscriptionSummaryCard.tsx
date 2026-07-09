"use client";

import type { ReactNode } from "react";
import { CTA_LABELS } from "@/lib/design/cta";

type SubscriptionSummaryCardProps = {
    planName: string;
    statusClass: string;
    statusLabel: string;
    hasSubscription: boolean;
    amount: string;
    interval: string;
    periodStartLabel: string;
    periodEndLabel: string;
    loaded: boolean;
    trialBanner: ReactNode;
    isPending: boolean;
    primaryActionLabel: string;
    onPrimaryAction: () => void;
    onCancelClick: () => void;
    showReactivate: boolean;
    onReactivate: () => void;
};

export function SubscriptionSummaryCard({
    planName,
    statusClass,
    statusLabel,
    hasSubscription,
    amount,
    interval,
    periodStartLabel,
    periodEndLabel,
    loaded,
    trialBanner,
    isPending,
    primaryActionLabel,
    onPrimaryAction,
    onCancelClick,
    showReactivate,
    onReactivate,
}: SubscriptionSummaryCardProps) {
    return (
        <div className="rounded-md border border-(--card-stroke) bg-(--background) p-4">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                    <p className="text-sm text-(--ink-muted)">Current Plan</p>
                    <p className="text-2xl font-semibold text-(--foreground)">{planName}</p>
                    <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusClass}`}
                    >
                        {statusLabel}
                    </span>
                    {hasSubscription ? (
                        <>
                            <p className="text-sm text-(--ink-muted)">
                                Price: {amount} / {interval}
                            </p>
                            <p className="text-sm text-(--ink-muted)">
                                Period: {periodStartLabel} - {periodEndLabel}
                            </p>
                            {trialBanner}
                        </>
                    ) : loaded ? (
                        <p className="text-sm text-(--ink-muted)">
                            No billing — upgrade to unlock paid features.
                        </p>
                    ) : null}
                </div>
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={onPrimaryAction}
                        disabled={isPending}
                        className="rounded-md border border-(--card-stroke) px-3 py-2 text-sm hover:bg-(--card) disabled:opacity-50"
                    >
                        {primaryActionLabel}
                    </button>
                    {hasSubscription && (
                        <button
                            type="button"
                            onClick={onCancelClick}
                            disabled={isPending}
                            className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                            {CTA_LABELS.cancel}
                        </button>
                    )}
                    {showReactivate && (
                        <button
                            type="button"
                            onClick={onReactivate}
                            disabled={isPending}
                            className="rounded-md border border-blue-300 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                            {CTA_LABELS.reactivateSubscription}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
