"use client";

import Link from "next/link";
import { useAdminTier } from "@/components/admin/AdminTierContext";
import { TIER_FEATURES } from "@/lib/billing/tiers";
import { upgradeToPlan } from "@/lib/design/cta";

type UpgradeGateProps = {
    feature: string;
    requiredTier: string;
    currentTier?: string;
    features?: Record<string, boolean>;
    children: React.ReactNode;
};

const TIER_ORDER: Readonly<Record<string, number>> = {
    free: 0,
    community: 0,
    team: 1,
    enterprise: 2,
};

export function UpgradeGate({
    feature,
    requiredTier,
    currentTier: currentTierProp,
    features: featuresProp,
    children,
}: UpgradeGateProps) {
    const context = useAdminTier();
    const features = featuresProp ?? context.features;
    const currentTier = currentTierProp ?? context.tier;

    if (features[feature] === true) {
        return <>{children}</>;
    }

    const featureDescription = TIER_FEATURES[requiredTier] ?? "Upgrade to unlock this feature.";
    const requiredTierLabel = requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1);
    const currentTierRank = TIER_ORDER[currentTier.toLowerCase()];
    const requiredTierRank = TIER_ORDER[requiredTier.toLowerCase()];
    const upgradeUnavailable =
        currentTierRank !== undefined &&
        requiredTierRank !== undefined &&
        currentTierRank >= requiredTierRank;
    const featureLabel = feature.replace(/_/g, " ");

    return (
        <div className="relative min-h-56 w-full overflow-hidden rounded-3xl border border-(--card-stroke) bg-(--card) sm:min-h-80">
            {/* Frosted overlay effect */}
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-(--card)/80 p-5 text-center backdrop-blur-sm sm:p-8">
                <div className="max-w-md space-y-4 sm:space-y-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-(--accent)">
                            {upgradeUnavailable
                                ? `${requiredTierLabel} plan feature unavailable`
                                : `${requiredTierLabel} plan feature`}
                        </p>
                        <h2 className="text-h2 text-(--foreground)">
                            {upgradeUnavailable ? "Feature unavailable" : `Unlock ${featureLabel}`}
                        </h2>
                        <p className="text-body text-(--ink-muted)">
                            {upgradeUnavailable
                                ? `Contact an administrator to enable ${featureLabel} for this plan.`
                                : featureDescription}
                        </p>
                    </div>

                    {upgradeUnavailable ? null : (
                        <div className="rounded-xl border border-(--card-stroke) bg-(--background) p-4 text-sm">
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-(--ink-muted)">Current Plan</span>
                                <span className="font-medium text-(--foreground) capitalize">
                                    {currentTier}
                                </span>
                            </div>
                            <div className="my-2 border-t border-(--card-stroke)" />
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-(--ink-muted)">Required Plan</span>
                                <span className="font-medium text-(--accent)">
                                    {requiredTierLabel}
                                </span>
                            </div>
                        </div>
                    )}

                    {upgradeUnavailable ? null : (
                        <Link
                            href="/org/admin/settings"
                            className="inline-flex items-center justify-center rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-(--accent-foreground) transition-colors hover:bg-(--accent)/90 focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2"
                        >
                            {upgradeToPlan(requiredTierLabel)}
                        </Link>
                    )}
                </div>
            </div>

            {/* Blurred background content preview */}
            <div className="opacity-20 pointer-events-none select-none" aria-hidden="true">
                {children}
            </div>
        </div>
    );
}
