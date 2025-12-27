import Link from "next/link";

import { getOpportunities } from "@/lib/api";

export default async function OpportunitiesPage() {
  const data = await getOpportunities({}).catch(() => null);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-16 pt-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
              Opportunities
            </p>
            <h1 className="mt-2 font-[var(--font-display)] text-3xl">
              Focus Cards
            </h1>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Evidence-backed bets with suggested experiments.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[var(--card-stroke)] px-4 py-2 text-xs uppercase tracking-[0.2em]"
          >
            Back to Home
          </Link>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          {(data?.items ?? []).map((card) => (
            <div
              key={card.id}
              className="rounded-3xl border border-[var(--card-stroke)] bg-white/80 p-6"
            >
              <h2 className="font-[var(--font-display)] text-xl">{card.title}</h2>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                {card.rationale}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {card.evidence_links.map((link) => (
                  <Link
                    key={link}
                    href={link}
                    className="rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1"
                  >
                    Evidence
                  </Link>
                ))}
              </div>
              <div className="mt-4 space-y-2 text-xs text-[var(--ink-muted)]">
                {card.suggested_experiments.map((experiment) => (
                  <div
                    key={experiment}
                    className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-white/70 px-3 py-2"
                  >
                    {experiment}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!data?.items?.length && (
            <div className="rounded-3xl border border-dashed border-[var(--card-stroke)] bg-white/70 p-6 text-sm text-[var(--ink-muted)]">
              Opportunity data unavailable.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
