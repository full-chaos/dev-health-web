"use client";

import Link from "next/link";
import { useAdminTier } from "@/components/admin/AdminTierContext";
import { buttonClassName } from "@/components/shared/Button";
import { Notice } from "@/components/ui/Notice";
import { Section } from "@/components/ui/Section";
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

    const sentenceFeature = featureLabel.charAt(0).toUpperCase() + featureLabel.slice(1);

    return (
        <div className="flex flex-col gap-4" data-testid="upgrade-gate">
            <Notice
                variant="warn"
                live={false}
                titleAs="h2"
                title={upgradeUnavailable ? "Feature unavailable" : `Unlock ${featureLabel}`}
                action={
                    upgradeUnavailable ? undefined : (
                        <Link
                            href="/org/admin/settings"
                            className={buttonClassName("secondary", "sm")}
                        >
                            {upgradeToPlan(requiredTierLabel)}
                        </Link>
                    )
                }
                data-testid="upgrade-gate-notice"
            >
                <p className="text-label-caps uppercase">
                    {upgradeUnavailable
                        ? `${requiredTierLabel} plan feature unavailable`
                        : `${requiredTierLabel} plan feature`}
                </p>
                <p className="mt-1">
                    {upgradeUnavailable
                        ? `Contact an administrator to enable ${featureLabel} for this plan.`
                        : featureDescription}
                </p>
                {upgradeUnavailable ? null : (
                    <p className="mt-2">
                        <span>Current Plan</span>{" "}
                        <span className="font-semibold capitalize">{currentTier}</span>
                        {" · "}
                        <span>Required Plan</span>{" "}
                        <span className="font-semibold">{requiredTierLabel}</span>
                    </p>
                )}
            </Notice>
            {/* The gated content is not drawn (and not mounted): an empty card holds its place. */}
            <Section as="h3" title={sentenceFeature} data-testid="upgrade-gate-empty">
                <p className="text-sm text-(--ink-muted)">
                    {`Not available on the ${currentTier} plan.`}
                </p>
            </Section>
        </div>
    );
}
