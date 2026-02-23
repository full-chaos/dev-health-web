import Link from "next/link";
import { BetaBadge } from "@/components/BetaBadge";

const FEATURES = [
  {
    label: "Investment View",
    title: "See where effort actually goes",
    description:
      "Automatically categorize work into Feature Delivery, Maintenance, Operational Support, Quality, and Risk — so you can see the real allocation, not what was planned.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
        <path d="M22 12A10 10 0 0 0 12 2v10z" />
      </svg>
    ),
  },
  {
    label: "Flow Metrics",
    title: "Measure delivery health, not activity",
    description:
      "Track cycle time, review latency, WIP saturation, and throughput — the signals that reveal coordination debt before it becomes a crisis.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
      </svg>
    ),
  },
  {
    label: "DORA Dashboard",
    title: "Ship faster with confidence",
    description:
      "Deploy frequency, lead time, change failure rate, and recovery time — the four keys to software delivery performance, computed automatically from your existing tools.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m3 11 18-5v12L3 13v-2z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </svg>
    ),
  },
  {
    label: "Quadrant Explorer",
    title: "Spot systemic patterns early",
    description:
      "Churn × Throughput, Cycle Time × Throughput, WIP × Throughput, Review Load × Latency — four diagnostic views that surface problems before they surface in retros.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 12h18" />
        <path d="M12 3v18" />
      </svg>
    ),
  },
  {
    label: "Developer Health",
    title: "Protect your people",
    description:
      "After-hours work ratio, weekend commits, context-switching patterns — signals that help engineering leaders intervene before burnout takes hold.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    number: "01",
    title: "Connect your tools",
    description:
      "Point Dev Health at your GitHub, GitLab, or Jira instance. Connectors pull commits, PRs, deployments, and work items automatically.",
  },
  {
    number: "02",
    title: "Metrics compute daily",
    description:
      "The platform normalizes data across providers, computes daily rollups, and categorizes work into investment themes — no manual tagging required.",
  },
  {
    number: "03",
    title: "Explore patterns, not dashboards",
    description:
      "Heatmaps reveal cyclical patterns. Quadrants surface systemic issues. The cockpit frames everything through your role — IC, EM, PM, or Leadership.",
  },
];

const PERSONAS = [
  {
    role: "Individual Contributor",
    tag: "IC",
    focus: "Flow & Quality",
    description:
      "Understand your own delivery patterns. See review latency, context-switching signals, and after-hours trends — for reflection, not surveillance.",
  },
  {
    role: "Engineering Manager",
    tag: "EM",
    focus: "Flow & Throughput",
    description:
      "Spot coordination debt, WIP saturation, and review bottlenecks across your team. Intervene early on burnout signals.",
  },
  {
    role: "Product Manager",
    tag: "PM",
    focus: "Quality & Flow",
    description:
      "See where engineering effort actually goes versus what was planned. Track investment mix across feature work, maintenance, and operational load.",
  },
  {
    role: "Leadership",
    tag: "VP / CTO",
    focus: "Quality & Throughput",
    description:
      "Organization-level patterns across teams. DORA benchmarks, delivery pacing, and investment allocation — evidence for strategic decisions.",
  },
];

const FOOTER_LINKS = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Who it's for", href: "#who-its-for" },
  ],
  Resources: [
    { label: "Documentation", href: "https://github.com/full-chaos/dev-health-ops", external: true },
    { label: "GitHub", href: "https://github.com/full-chaos/dev-health-ops", external: true },
  ],
  Legal: [
    { label: "Privacy", href: "#" },
    { label: "Terms", href: "#" },
  ],
};

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-(image:--hero-gradient) text-foreground">

      <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Dev Health home">
          <span className="font-(--font-display) text-lg font-semibold tracking-tight">
            Dev Health
          </span>
          <span className="rounded-full border border-(--card-stroke) bg-(--card-70) px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
            OSS
          </span>
          <BetaBadge />
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/auth/signin"
            className="text-sm text-(--ink-muted) transition hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="rounded-full bg-(--accent) px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </nav>

      <main>

        <section className="mx-auto max-w-7xl px-6 pb-20 pt-16 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
              Engineering effort analytics
            </p>
            <h1 className="mt-6 font-(--font-display) text-4xl leading-tight sm:text-5xl lg:text-6xl">
              Where is your engineering effort{" "}
              <span className="text-(--accent)">actually</span> going?
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-(--ink-muted)">
              Dev Health is an open-source analytics platform for team operating
              modes and developer health. See where effort is invested and what
              it costs your people.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/auth/signup"
                className="rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
              >
                Start for free
              </Link>
              <Link
                href="https://github.com/full-chaos/dev-health-ops"
                className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
              >
                View on GitHub
              </Link>
            </div>
          </div>


          <div className="mx-auto mt-16 max-w-5xl">
            <div className="overflow-hidden rounded-3xl border border-(--card-stroke) bg-(--card-80) shadow-[0_20px_60px_-40px_rgba(0,0,0,0.4)]">
              <div className="border-b border-(--card-stroke) px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="size-3 rounded-full bg-(--card-stroke)" />
                  <div className="size-3 rounded-full bg-(--card-stroke)" />
                  <div className="size-3 rounded-full bg-(--card-stroke)" />
                  <span className="ml-3 text-xs text-(--ink-muted)">
                    Dev Health Ops Cockpit
                  </span>
                </div>
              </div>
              <div className="grid gap-4 p-6 md:grid-cols-3">
                {["DORA", "Flow", "Quality"].map((tab) => (
                  <div
                    key={tab}
                    className="rounded-2xl border border-(--card-stroke) bg-(--card) p-4"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                      {tab}
                    </p>
                    <div className="mt-3 flex items-end gap-1">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div
                          key={`bar-${tab}-${i}`}
                          className="flex-1 rounded-sm bg-(--accent)/20"
                          style={{
                            height: `${20 + Math.sin(i * 1.2) * 16 + i * 4}px`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>


        <section id="features" className="mx-auto max-w-7xl px-6 pb-24">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
              Capabilities
            </p>
            <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
              Signals, not surveillance
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-(--ink-muted)">
              Every metric traces to evidence. Every insight is a hypothesis
              starter, not a verdict. Trends over absolutes — direction matters
              more than point values.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.label}
                className="group rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 transition hover:-translate-y-1"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
                    {feature.icon}
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                    {feature.label}
                  </p>
                </div>
                <h3 className="mt-4 font-(--font-display) text-lg">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--ink-muted)">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>


        <section id="how-it-works" className="mx-auto max-w-7xl px-6 pb-24">
          <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 sm:p-12">
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
              How it works
            </p>
            <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
              From zero to insights in minutes
            </h2>

            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <div key={step.number} className="relative">
                  {i < STEPS.length - 1 && (
                    <div className="absolute right-0 top-6 hidden h-px w-full translate-x-1/2 bg-(--card-stroke) md:block" />
                  )}
                  <div className="relative">
                    <span className="font-(--font-mono) text-3xl font-semibold text-(--accent)/30">
                      {step.number}
                    </span>
                    <h3 className="mt-3 font-(--font-display) text-lg">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-(--ink-muted)">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>


        <section id="who-its-for" className="mx-auto max-w-7xl px-6 pb-24">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
              Built for your role
            </p>
            <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
              One platform, four perspectives
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-(--ink-muted)">
              The cockpit adapts to your role — surfacing the metrics and
              investigation paths that matter most to you.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PERSONAS.map((persona) => (
              <div
                key={persona.tag}
                className="group rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 transition hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-(--accent)/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-(--accent)">
                    {persona.tag}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-(--accent-2)">
                    {persona.focus}
                  </span>
                </div>
                <h3 className="mt-4 font-(--font-display) text-lg">
                  {persona.role}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--ink-muted)">
                  {persona.description}
                </p>
              </div>
            ))}
          </div>
        </section>


        <section className="mx-auto max-w-7xl px-6 pb-24">
          <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 text-center sm:p-12">
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
              Open source
            </p>
            <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
              Built in the open, for everyone
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-(--ink-muted)">
              Dev Health is fully open source. Deploy it on your infrastructure,
              audit every metric computation, and contribute to the roadmap.
              Accessibility over extraction.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/auth/signup"
                className="rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
              >
                Get started free
              </Link>
              <Link
                href="https://github.com/full-chaos/dev-health-ops"
                className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
              >
                Star on GitHub
              </Link>
            </div>
          </div>
        </section>
      </main>


      <footer className="border-t border-(--card-stroke)">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-(--font-display) text-lg font-semibold">
              Dev Health
            </p>
            <p className="mt-2 text-sm text-(--ink-muted)">
              Open-source analytics for team operating modes and developer
              health.
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                {group}
              </p>
              <ul className="mt-3 space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-(--ink-muted) transition hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-(--ink-muted) transition hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-(--card-stroke)">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
            <p className="text-xs text-(--ink-muted)">
              &copy; {new Date().getFullYear()} Dev Health. All rights reserved.
            </p>
            <p className="text-xs text-(--ink-muted)">
              Learning, not judgment.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
