import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "For Engineering Managers — Full Chaos Dev Health",
  description: "Coach teams with evidence, not rankings.",
};

type FeatureConfig = {
  label: string;
  title: string;
  description: string;
  href: string;
  comingSoon?: boolean;
  icon: ReactNode;
};

const FEATURES: FeatureConfig[] = [
  {
    label: "Team Flow",
    title: "Visualize delivery pace",
    description: "Measure throughput and cycle time to keep the team unblocked and delivering consistently.",
    href: "/team-flow",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    label: "WIP & Review",
    title: "Eliminate bottlenecks",
    description: "Spot WIP saturation and review latency before they turn into major coordination debt.",
    href: "/bottleneck",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    label: "Reflection",
    title: "Single-person reflection",
    description: "Single-person views are strictly for private reflection, not peer ranking or surveillance.",
    href: "/people",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    ),
  },
  {
    label: "Sustainability",
    title: "Protect your people",
    description: "Intervene early on burnout signals like after-hours work and weekend commit patterns.",
    href: "/cognitive-load",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    ),
  },
  {
    label: "Recommendations",
    title: "Evidence-backed playbooks",
    description: "Manager coaching playbooks generated from actual investment data to support strategic conversations.",
    href: "/opportunities",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
];

export default function EngineeringManagerPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
            For Engineering Managers
          </p>
          <h1 className="mt-6 font-(--font-display) text-4xl leading-tight sm:text-5xl lg:text-6xl">
            Coach teams with evidence, not rankings.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-(--ink-muted)">
            Gain deep visibility into team flow and bottlenecks. Equip yourself with data to unblock your engineers, protect their focus, and advocate for sustainable work without resorting to leaderboards.
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

      {/* Primary Surfaces Grid */}
      <section id="surfaces" className="mx-auto max-w-7xl px-6 pb-24">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
            Primary Surfaces
          </p>
          <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
            Tools for effective leadership
          </h2>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const cardInner = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
                      {feature.icon}
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                      {feature.label}
                    </p>
                  </div>
                  {feature.comingSoon && (
                    <span className="rounded-full border border-(--card-stroke) bg-(--card) px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
                      Coming soon
                    </span>
                  )}
                </div>
                <h3 className="mt-4 font-(--font-display) text-lg group-hover:text-(--accent) transition-colors">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-(--ink-muted)">
                  {feature.description}
                </p>
              </>
            );
            if (feature.comingSoon) {
              return (
                <div
                  key={feature.label}
                  className="block rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 opacity-90"
                  aria-disabled="true"
                >
                  {cardInner}
                </div>
              );
            }
            return (
              <Link
                key={feature.label}
                href={feature.href}
                className="group block rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 transition hover:-translate-y-1 hover:border-(--accent)/50"
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

      {/* Final CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 text-center sm:p-12">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
            Open source
          </p>
          <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
            Built in the open, for everyone
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-(--ink-muted)">
            Full Chaos Dev Health is fully open source. Deploy it on your infrastructure,
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
    </>
  );
}
