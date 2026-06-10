const CONTRACT_ITEMS = [
    {
        title: "No leaderboards",
        body: "Dev Health does not rank people against each other or turn signals into per-person scoreboards.",
    },
    {
        title: "Team and repo first",
        body: "Operating views default to team, repo, and system aggregation before any single-person context.",
    },
    {
        title: "Reflection or coaching only",
        body: "Individual views are limited to self-reflection or an explicit coaching context, never peer comparison.",
    },
];

type NoSurveillanceContractProps = {
    compact?: boolean;
};

export function NoSurveillanceContract({ compact = false }: NoSurveillanceContractProps) {
    return (
        <section
            className={`rounded-3xl border border-(--border) bg-(--card-80) ${
                compact ? "p-5" : "p-6"
            }`}
            data-testid="no-surveillance-contract"
        >
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--ink-muted)">
                No-surveillance contract
            </p>
            <h2 className="mt-2 font-(--font-display) text-2xl text-(--foreground)">
                Signals for learning, not judgment.
            </h2>
            <p className="mt-3 text-sm leading-6 text-(--ink-muted)">
                Dev Health makes system pressure visible without creating surveillance surfaces.
                These guardrails apply across the product.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
                {CONTRACT_ITEMS.map((item) => (
                    <article
                        key={item.title}
                        className="rounded-2xl border border-(--border) bg-card px-4 py-3"
                    >
                        <h3 className="text-sm font-semibold text-(--foreground)">{item.title}</h3>
                        <p className="mt-2 text-xs leading-5 text-(--ink-muted)">{item.body}</p>
                    </article>
                ))}
            </div>
        </section>
    );
}
