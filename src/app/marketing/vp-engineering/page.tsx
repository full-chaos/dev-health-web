import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "For VP Engineering — Full Chaos Dev Health",
  description: "Know where delivery is constrained before it becomes a miss.",
};

const SURFACES = [
  {
    label: "Operating Review",
    title: "Engineering Operating Review",
    description: "Align engineering outputs with business outcomes. See organizational throughput and delivery pacing at a glance.",
    href: "/operating-review",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
  },
  {
    label: "Capacity Forecast",
    title: "Predictable Capacity",
    description: "Forecast delivery constraints based on historical throughput, cycle time trends, and WIP saturation.",
    href: "/capacity-planning",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    label: "Bottlenecks",
    title: "Delivery Bottleneck Summary",
    description: "Spot where work is piling up. Identify high review latency and coordination debt before it impacts ship dates.",
    href: "/bottleneck",
    comingSoon: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 22h14" />
        <path d="M5 2h14" />
        <path d="M17 22V2" />
        <path d="M7 22V2" />
      </svg>
    ),
  },
  {
    label: "Investment",
    title: "Investment Allocation",
    description: "See the exact mix of feature delivery, operational support, maintenance, and technical debt across the organization.",
    href: "/investment",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
        <path d="M22 12A10 10 0 0 0 12 2v10z" />
      </svg>
    ),
  },
  {
    label: "Reliability",
    title: "Reliability & Incidents",
    description: "Connect incident volume to delivery velocity. Understand the cost of poor quality on feature throughput.",
    href: "/quality",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m3 11 18-5v12L3 13v-2z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </svg>
    ),
  },
];


export default function VPEngineeringPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
            For VP Engineering
          </p>
          <h1 className="mt-6 font-(--font-display) text-4xl leading-tight sm:text-5xl lg:text-6xl">
            Where is delivery <span className="text-(--accent)">constrained</span>?
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-(--ink-muted)">
            Know where delivery is constrained before it becomes a miss.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              className="rounded-full bg-(--accent) px-8 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              Start for free
            </Link>
            <Link
              href="/marketing/pricing"
              className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Primary Surfaces */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
            Primary Surfaces
          </p>
          <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
            Map constraints to reality
          </h2>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SURFACES.map((surface) => {
            const cardInner = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
                      {surface.icon}
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                      {surface.label}
                    </p>
                  </div>
                  {surface.comingSoon && (
                    <span className="rounded-full border border-(--card-stroke) bg-(--card) px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
                      Coming soon
                    </span>
                  )}
                </div>
                <h3 className="mt-4 font-(--font-display) text-lg">
                  {surface.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--ink-muted)">
                  {surface.description}
                </p>
              </>
            );
            if (surface.comingSoon) {
              return (
                <div
                  key={surface.label}
                  className="block rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 opacity-90"
                  aria-disabled="true"
                >
                  {cardInner}
                </div>
              );
            }
            return (
              <Link
                key={surface.label}
                href={surface.href}
                className="group block rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 transition hover:-translate-y-1"
              >
                {cardInner}
              </Link>
            );
          })}
        </div>
      </section>

      {/* No surveillance, just signal — canonical section, identical across all buyer pages */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 sm:p-12">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
              Our posture
            </p>
            <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
              No surveillance, just signal
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-(--ink-muted)">
              Engineering intelligence without per-seat surveillance pricing — or
              per-person scoring. Every metric is a system signal, not a performance
              rating. Every insight traces to evidence you can inspect.
            </p>
          </div>

          <ul className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2">
            {[
              { id: "ns-no-leaderboards", title: "No leaderboards", body: "We do not rank people against each other. Ever." },
              { id: "ns-team-first", title: "Team and repo first", body: "Aggregation defaults to systems, not individuals." },
              { id: "ns-reflection-only", title: "Individual views are reflection-only", body: "Single-person surfaces exist for self-reflection and coaching — never peer comparison." },
              { id: "ns-trends-over-absolutes", title: "Trends over absolutes", body: "Direction matters more than point values. We benchmark you against your own baseline." },
              { id: "ns-evidence-over-scores", title: "Evidence over scores", body: "Every signal links back to the PRs, reviews, commits, and incidents behind it." },
            ].map((pillar) => (
              <li key={pillar.id} className="rounded-2xl border border-(--card-stroke) bg-(--card) p-5">
                <p className="font-(--font-display) text-base">{pillar.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-(--ink-muted)">{pillar.body}</p>
              </li>
            ))}
          </ul>

          <p className="mx-auto mt-10 max-w-2xl text-center text-xs uppercase tracking-[0.2em] text-(--accent)">
            Learning, not judgment.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 text-center sm:p-12">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
            Open source
          </p>
          <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
            Built in the open, for everyone
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-(--ink-muted)">
            Full Chaos Dev Health is fully open source. Deploy it on your infrastructure, audit every metric computation, and contribute to the roadmap. Accessibility over extraction.
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
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-(--card-stroke) bg-(--card-70) px-8 py-3 text-sm font-medium transition hover:border-foreground/30"
            >
              Star on GitHub
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}