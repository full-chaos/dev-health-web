import { INVESTMENT_ROLLUP_COPY, type InvestmentRollup } from "./investmentRollup";

/**
 * The owning-team roll-up label of one project (CHAOS-12178). The visible text is short; the
 * sentence a screen reader hears says what the roll-up means. `named` puts the project's name first,
 * for a place that shows roll-ups of more than one project.
 */
export function InvestmentRollupLabel({
    rollup,
    named = false,
}: {
    rollup: InvestmentRollup;
    named?: boolean;
}) {
    const name = named && rollup.subject.label?.trim() ? `${rollup.subject.label}: ` : "";
    return (
        <span
            data-testid="ask-dev-investment-rollup"
            data-subject={rollup.subject.canonical_id}
            className="inline-flex max-w-full items-center rounded-full border border-(--card-stroke) bg-(--surface) px-2 py-0.5 text-xs text-(--ink-muted)"
        >
            <span aria-hidden="true" className="break-words">
                {name}
                {INVESTMENT_ROLLUP_COPY.visible(rollup)}
            </span>
            <span className="sr-only">
                {name}
                {INVESTMENT_ROLLUP_COPY.aria(rollup)}
            </span>
        </span>
    );
}
