import { SettingsSection } from "./SettingsSection";

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

type BillingSettingsProps = {
  tier?: string;
};

export function BillingSettings({ tier = "free" }: BillingSettingsProps) {
  const tierLabel = TIER_LABELS[tier] ?? tier;
  const canUpgrade = tier !== "enterprise";

  return (
    <SettingsSection
      title="Billing"
      description="Manage your subscription and billing details."
    >
      <div className="flex items-center justify-between rounded-md border border-(--card-stroke) bg-(--background) p-4">
        <div>
          <p className="text-sm font-medium text-(--foreground)">Current Plan</p>
          <p className="text-2xl font-bold text-(--foreground)">{tierLabel}</p>
        </div>
        {canUpgrade && (
          <button
            type="button"
            className="rounded-md bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2"
          >
            Upgrade Plan
          </button>
        )}
      </div>
      <div className="mt-4 text-sm text-(--ink-muted)">
        {tier === "free" ? (
          <p>Upgrade to unlock more features.</p>
        ) : (
          <p>Contact support for billing inquiries.</p>
        )}
      </div>
    </SettingsSection>
  );
}
