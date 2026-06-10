"use client";

import Link from "next/link";
import { useAdminTier } from "@/components/admin/AdminTierContext";
import { TIER_FEATURES } from "@/lib/billing/tiers";

type UpgradeGateProps = {
    feature: string;
    requiredTier: string;
    currentTier?: string;
    features?: Record<string, boolean>;
    children: React.ReactNode;
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

    return (
        <div className="relative min-h-[400px] w-full overflow-hidden rounded-3xl border border-(--border) bg-(--card)">
            {/* Frosted overlay effect */}
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-(--card)/80 backdrop-blur-sm p-8 text-center">
                <div className="max-w-md space-y-6">
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-(--accent)">
                            {requiredTierLabel} Plan Feature
                        </p>
                        <h2 className="font-(--font-display) text-3xl text-(--foreground)">
                            Unlock {feature.replace(/_/g, " ")}
                        </h2>
                        <p className="text-(--ink-muted)">{featureDescription}</p>
                    </div>

                    <div className="rounded-xl border border-(--border) bg-(--background) p-4 text-sm">
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-(--ink-muted)">Current Plan</span>
                            <span className="font-medium text-(--foreground) capitalize">
                                {currentTier}
                            </span>
                        </div>
                        <div className="my-2 border-t border-(--border)" />
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-(--ink-muted)">Required Plan</span>
                            <span className="font-medium text-(--accent)">{requiredTierLabel}</span>
                        </div>
                    </div>

                    <Link
                        href="/admin/settings"
                        className="inline-flex items-center justify-center rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-(--accent)/90 focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2"
                    >
                        Upgrade to {requiredTierLabel}
                    </Link>
                </div>
            </div>

            {/* Blurred background content preview */}
            <div className="opacity-20 pointer-events-none select-none" aria-hidden="true">
                {children}
            </div>
        </div>
    );
}
