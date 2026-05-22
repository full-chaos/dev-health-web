import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "For CTO / Architecture — Full Chaos Dev Health",
  description: "See where change pressure is compounding architectural risk.",
};

type SurfaceConfig = {
  title: string;
  href: string;
  description: string;
  comingSoon?: boolean;
  icon: ReactNode;
};

const SURFACES: SurfaceConfig[] = [
  {
    title: "Compounding Risk",
    href: "/risk/compounding",
    comingSoon: false,
    description: "Track where high churn meets high complexity to identify system fragility.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    title: "Complexity trends",
    href: "/complexity",
    comingSoon: false,
    description: "Monitor code complexity over time to prevent unmanageable technical debt.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    title: "Ownership concentration",
    href: "/code",
    description: "Identify key person dependencies and knowledge silos before they become bottlenecks.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    title: "Hotspots",
    href: "/code",
    description: "Pinpoint the areas of your codebase consuming the most effort and generating the most bugs.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
    ),
  },
  {
    title: "Incident correlation",
    href: "/incident-correlation",
    comingSoon: false,
    description: "Connect system outages to recent deployment activity to speed up root cause analysis.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
        <line x1="12" y1="2" x2="12" y2="12" />
      </svg>
    ),
  },
];

export default function CTOArchitecturePage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pb-20 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
            For CTO / Architecture
          </p>
          <h1 className="mt-6 font-(--font-display) text-4xl leading-tight sm:text-5xl lg:text-6xl">
            See where change pressure is compounding{" "}
            <span className="text-(--accent)">architectural risk</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-(--ink-muted)">
            Align engineering effort with architectural reality. Identify systemic bottlenecks, key person dependencies, and fragile codebases before they compromise your delivery velocity.
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

      {/* Primary surfaces */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
            Primary surfaces
          </p>
          <h2 className="mt-4 font-(--font-display) text-3xl sm:text-4xl">
            Insights mapped to architectural health
          </h2>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SURFACES.map((surface) => {
            const cardInner = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
                    {surface.icon}
                  </div>
                  {surface.comingSoon && (
                    <span className="rounded-full border border-(--card-stroke) bg-(--card) px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
                      Coming soon
                    </span>
                  )}
                </div>
                <h3 className="mt-4 font-(--font-display) text-lg group-hover:text-(--accent) transition-colors">
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
                  key={surface.title}
                  className="block rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 opacity-90"
                  aria-disabled="true"
                >
                  {cardInner}
                </div>
              );
            }
            return (
              <Link
                key={surface.title}
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
              {
                id: "ns-no-leaderboards",
                title: "No leaderboards",
                body: "We do not rank people against each other. Ever.",
              },
              {
                id: "ns-team-first",
                title: "Team and repo first",
                body: "Aggregation defaults to systems, not individuals.",
              },
              {
                id: "ns-reflection-only",
                title: "Individual views are reflection-only",
                body: "Single-person surfaces exist for self-reflection and coaching — never peer comparison.",
              },
              {
                id: "ns-trends-over-absolutes",
                title: "Trends over absolutes",
                body: "Direction matters more than point values. We benchmark you against your own baseline.",
              },
              {
                id: "ns-evidence-over-scores",
                title: "Evidence over scores",
                body: "Every signal links back to the PRs, reviews, commits, and incidents behind it.",
              },
            ].map((pillar) => (
              <li
                key={pillar.id}
                className="rounded-2xl border border-(--card-stroke) bg-(--card) p-5"
              >
                <p className="font-(--font-display) text-base">{pillar.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-(--ink-muted)">
                  {pillar.body}
                </p>
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
