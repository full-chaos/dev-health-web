import type { Metadata } from "next";
import Link from "next/link";
import { getBackendUrl } from "@/lib/origin";
import { auth } from "@/lib/auth";
import { getSubscription } from "@/lib/billing/actions";

export const metadata: Metadata = {
  title: "Pricing — Dev Health",
  description:
    "Simple, transparent pricing. Start free, scale as you grow.",
};

// ---------------------------------------------------------------------------
// Billing API types & data fetching
// ---------------------------------------------------------------------------

type BillingPrice = {
  id: string;
  interval: string;
  amount: number;
  currency: string;
  is_active: boolean;
};

type FeatureBundle = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  features: string[];
};

type BillingPlan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  tier: string;
  is_active: boolean;
  display_order: number;
  prices: BillingPrice[];
  bundles: FeatureBundle[];
};


async function fetchPlans(): Promise<BillingPlan[]> {
  try {
    const baseUrl = getBackendUrl();
    const response = await fetch(`${baseUrl}/api/v1/billing/plans`, {
      signal: AbortSignal.timeout(5_000),
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return [];
    }

    const plans = (await response.json()) as BillingPlan[];
    if (!Array.isArray(plans) || plans.length === 0) {
      return [];
    }

    return plans.sort((a, b) => a.display_order - b.display_order);
  } catch {
    return [];
  }
}

function formatPrice(amountInCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(amountInCents / 100);
}

// ---------------------------------------------------------------------------
// Static design data (original 3-tier layout)
// ---------------------------------------------------------------------------

const CHECK = (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-(--accent)">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const DASH = (
  <span className="text-(--ink-muted)" aria-hidden="true" title="Not included">—</span>
);

type Tier = {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Community",
    price: "Free",
    period: "forever",
    description: "For individuals and small teams getting started with engineering analytics.",
    features: [
      "Up to 5 repos",
      "Up to 10 contributors",
      "Core metrics (DORA, Flow)",
      "Community support",
      "Self-hosted only",
    ],
    cta: "Get started free",
    ctaHref: "/auth/signup",
    highlighted: false,
  },
  {
    name: "Team",
    price: "Contact us",
    period: "for pricing",
    description: "For growing teams that need full visibility into delivery health and investment patterns.",
    features: [
      "Unlimited repos",
      "Unlimited contributors",
      "All analytics views",
      "Investment View",
      "Quadrant Explorer",
      "Priority support",
      "Cloud or self-hosted",
    ],
    cta: "Start free trial",
    ctaHref: "/auth/signup?plan=team&trial=true",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "pricing",
    description: "For organizations that need enterprise-grade security, compliance, and dedicated support.",
    features: [
      "Everything in Team",
      "SSO / SAML",
      "Audit logs",
      "Dedicated support",
      "Custom integrations",
      "SLA guarantees",
    ],
    cta: "Contact sales",
    ctaHref: "mailto:sales@fullchaos.dev",
    highlighted: false,
  },
];

const COMPARISON = [
  { feature: "Repos", community: "5", team: "Unlimited", enterprise: "Unlimited" },
  { feature: "Contributors", community: "10", team: "Unlimited", enterprise: "Unlimited" },
  { feature: "DORA Metrics", community: true, team: true, enterprise: true },
  { feature: "Flow Metrics", community: true, team: true, enterprise: true },
  { feature: "Investment View", community: false, team: true, enterprise: true },
  { feature: "Quadrant Explorer", community: false, team: true, enterprise: true },
  { feature: "Developer Health", community: false, team: true, enterprise: true },
  { feature: "Heatmaps", community: false, team: true, enterprise: true },
  { feature: "SSO / SAML", community: false, team: false, enterprise: true },
  { feature: "Audit Logs", community: false, team: false, enterprise: true },
  { feature: "Custom Integrations", community: false, team: false, enterprise: true },
  { feature: "Support", community: "Community", team: "Priority", enterprise: "Dedicated" },
  { feature: "Deployment", community: "Self-hosted", team: "Cloud + Self-hosted", enterprise: "Cloud + Self-hosted" },
];

function ComparisonCell({ value }: { value: boolean | string }) {
  if (value === true) return CHECK;
  if (value === false) return DASH;
  return <span className="text-sm">{value}</span>;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function PricingPage() {
  const session = await auth();
  let trialNotice: string | null = null;
  let isTrialing = false;

  if (session?.user?.org_id) {
    const subRes = await getSubscription();
    if (!subRes.error && subRes.data?.status === "trialing") {
      isTrialing = true;
      const trialEnd = new Date(subRes.data.trial_end ?? "");
      const now = new Date();
      const diffMs = trialEnd.getTime() - now.getTime();
      const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      trialNotice = `You're currently on a Team trial (${days} ${days === 1 ? "day" : "days"} remaining)`;
    }
  }

  const plans = await fetchPlans();

  // Overlay dynamic API prices onto static tiers
  const teamPlan = plans.find((p) => p.key === "team");
  const enterprisePlan = plans.find((p) => p.key === "enterprise");

  const displayTiers: Tier[] = TIERS.map((tier) => {
    let tierData = { ...tier };
    if (tier.name === "Team" && teamPlan) {
      const monthly = teamPlan.prices.find((p) => p.interval === "monthly" && p.is_active);
      tierData = {
        ...tierData,
        price: monthly ? formatPrice(monthly.amount, monthly.currency) : tier.price,
      };
      
      if (isTrialing) {
        tierData.cta = "Manage subscription";
        tierData.ctaHref = "/settings/billing";
      }
    }
    if (tier.name === "Enterprise" && enterprisePlan) {
      const monthly = enterprisePlan.prices.find((p) => p.interval === "monthly" && p.is_active);
      tierData = {
        ...tierData,
        price: monthly ? formatPrice(monthly.amount, monthly.currency) : tier.price,
        period: monthly ? "per contributor / month" : tier.period,
      };
    }
    return tierData;
  });

  return (
    <>
      {/* Header */}
      <section className="mx-auto max-w-7xl px-6 pb-16 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
            Pricing
          </p>
          <h1 className="mt-6 font-(--font-display) text-4xl leading-tight sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-(--ink-muted)">
            Start free with the Community plan. Scale to Team when you need
            full analytics. Enterprise for organizations with compliance needs.
          </p>
        </div>
      </section>

      {/* Tier Cards */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        {trialNotice && (
          <div className="mx-auto mb-8 max-w-3xl rounded-xl border border-(--accent)/20 bg-(--accent)/10 p-4 text-center text-sm font-medium text-(--accent)">
            {trialNotice}
          </div>
        )}
        <div className="grid items-start gap-5 sm:grid-cols-3">
          {displayTiers.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-3xl border p-6 transition ${
                tier.highlighted
                  ? "relative border-(--accent) bg-(--card-80) shadow-[0_8px_40px_-12px_rgba(103,80,164,0.3)] sm:-mt-4 sm:p-8"
                  : "border-(--card-stroke) bg-(--card-80)"
              }`}
            >
              {tier.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-(--accent) px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                  Most Popular
                </span>
              )}

              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                {tier.name}
              </p>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-(--font-display) text-4xl font-semibold">
                  {tier.price}
                </span>
                <span className="text-sm text-(--ink-muted)">
                  {tier.period}
                </span>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-(--ink-muted)">
                {tier.description}
              </p>

              <ul className="mt-6 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-(--accent)/10 text-(--accent)">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                {tier.ctaHref.startsWith("mailto:") ? (
                  <a
                    href={tier.ctaHref}
                    className={`block w-full rounded-full py-3 text-center text-sm font-medium transition ${
                      tier.highlighted
                        ? "bg-(--accent) text-white hover:opacity-90"
                        : "border border-(--card-stroke) bg-(--card-70) hover:border-foreground/30"
                    }`}
                  >
                    {tier.cta}
                  </a>
                ) : (
                  <Link
                    href={tier.ctaHref}
                    className={`block w-full rounded-full py-3 text-center text-sm font-medium transition ${
                      tier.highlighted
                        ? "bg-(--accent) text-white hover:opacity-90"
                        : "border border-(--card-stroke) bg-(--card-70) hover:border-foreground/30"
                    }`}
                  >
                    {tier.cta}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 sm:p-12">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
            Compare plans
          </p>
          <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
            All features at a glance
          </h2>

          <div className="mt-10 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--card-stroke)">
                  <th className="pb-4 pr-4 text-left text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    Feature
                  </th>
                  <th className="pb-4 px-4 text-center text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    Community
                  </th>
                  <th className="pb-4 px-4 text-center text-xs uppercase tracking-[0.15em] text-(--accent)">
                    Team
                  </th>
                  <th className="pb-4 pl-4 text-center text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-b border-(--card-stroke)/50">
                    <td className="py-4 pr-4 text-sm">{row.feature}</td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex justify-center">
                        <ComparisonCell value={row.community} />
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex justify-center">
                        <ComparisonCell value={row.team} />
                      </span>
                    </td>
                    <td className="py-4 pl-4 text-center">
                      <span className="inline-flex justify-center">
                        <ComparisonCell value={row.enterprise} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 text-center sm:p-12">
          <h2 className="font-(--font-display) text-3xl sm:text-4xl">
            Ready to understand your engineering effort?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-(--ink-muted)">
            Start with the Community plan — free forever. Upgrade when your
            team is ready for deeper insights.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              className="rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              Get started free
            </Link>
            <a
              href="mailto:sales@fullchaos.dev"
              className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
            >
              Talk to sales
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
