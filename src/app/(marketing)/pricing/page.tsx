import Link from "next/link";

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

const FALLBACK_PLANS: BillingPlan[] = [
  {
    id: "fallback-team",
    key: "team",
    name: "Team",
    description: "For growing teams that need advanced delivery insights.",
    tier: "team",
    is_active: true,
    display_order: 1,
    prices: [
      { id: "team-monthly", interval: "monthly", amount: 4900, currency: "usd", is_active: true },
      { id: "team-yearly", interval: "yearly", amount: 47000, currency: "usd", is_active: true },
    ],
    bundles: [],
  },
  {
    id: "fallback-enterprise",
    key: "enterprise",
    name: "Enterprise",
    description: "For organizations that need governance, controls, and priority support.",
    tier: "enterprise",
    is_active: true,
    display_order: 2,
    prices: [
      { id: "enterprise-monthly", interval: "monthly", amount: 12900, currency: "usd", is_active: true },
      { id: "enterprise-yearly", interval: "yearly", amount: 124000, currency: "usd", is_active: true },
    ],
    bundles: [],
  },
];

function resolveBillingApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL ?? process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

async function fetchPlans(): Promise<BillingPlan[]> {
  try {
    const baseUrl = resolveBillingApiUrl();
    const response = await fetch(`${baseUrl}/api/v1/billing/plans`, {
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return FALLBACK_PLANS;
    }

    const plans = (await response.json()) as BillingPlan[];
    if (!Array.isArray(plans) || plans.length === 0) {
      return FALLBACK_PLANS;
    }

    return plans.sort((a, b) => a.display_order - b.display_order);
  } catch {
    return FALLBACK_PLANS;
  }
}

function formatPrice(amountInCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(amountInCents / 100);
}

export default async function PricingPage() {
  const plans = await fetchPlans();

  return (
    <div className="min-h-screen bg-(image:--hero-gradient) text-foreground">
      <div className="mx-auto max-w-6xl px-6 pb-20 pt-12">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-(--ink-muted) transition hover:text-foreground">
            Back to home
          </Link>
          <Link href="/auth/signup" className="rounded-full bg-(--accent) px-5 py-2 text-sm font-medium text-white transition hover:opacity-90">
            Start free
          </Link>
        </div>

        <header className="mx-auto mt-12 max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">Pricing</p>
          <h1 className="mt-4 font-(--font-display) text-4xl sm:text-5xl">Plans for every stage of delivery maturity</h1>
          <p className="mt-4 text-(--ink-muted)">
            Transparent pricing for team operating mode analytics. Upgrade anytime as your organization grows.
          </p>
        </header>

        <section className="mt-12 grid gap-6 md:grid-cols-2">
          {plans.map((plan) => {
            const monthly = plan.prices.find((price) => price.interval === "monthly" && price.is_active);
            const yearly = plan.prices.find((price) => price.interval === "yearly" && price.is_active);
            return (
              <article key={plan.id} className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8">
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">{plan.tier}</p>
                <h2 className="mt-2 font-(--font-display) text-3xl">{plan.name}</h2>
                <p className="mt-3 min-h-10 text-sm text-(--ink-muted)">{plan.description ?? ""}</p>

                <div className="mt-6 space-y-2">
                  {monthly && (
                    <p className="text-lg">
                      <span className="font-semibold">{formatPrice(monthly.amount, monthly.currency)}</span>
                      <span className="text-(--ink-muted)"> / month</span>
                    </p>
                  )}
                  {yearly && (
                    <p className="text-sm text-(--ink-muted)">
                      {formatPrice(yearly.amount, yearly.currency)} billed yearly
                    </p>
                  )}
                </div>

                <ul className="mt-6 space-y-2 text-sm text-(--ink-muted)">
                  {plan.bundles.flatMap((bundle) => bundle.features).slice(0, 5).map((feature) => (
                    <li key={`${plan.id}-${feature}`}>- {feature}</li>
                  ))}
                  {plan.bundles.length === 0 && <li>- Includes core Dev Health analytics capabilities</li>}
                </ul>

                <Link
                  href="/auth/signup"
                  className="mt-8 inline-flex rounded-full bg-(--accent) px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Choose {plan.name}
                </Link>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}
