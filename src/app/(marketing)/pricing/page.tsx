import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing — Dev Health",
  description:
    "Simple, transparent pricing. Start free, scale as you grow.",
};

const CHECK = (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-(--accent)">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const DASH = (
  <span className="text-(--ink-muted)" aria-label="Not included">—</span>
);

const TIERS = [
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
    price: "$12",
    period: "per contributor / month",
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
    ctaHref: "/auth/signup",
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

export default function PricingPage() {
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
        <div className="grid items-start gap-5 sm:grid-cols-3">
          {TIERS.map((tier) => (
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
