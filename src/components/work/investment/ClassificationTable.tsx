import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonClassName } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatNumber } from "@/lib/formatters";
import { titleCase } from "@/lib/investment";
import { getSortedThemes } from "@/lib/investmentMix";

type InvestmentMix = ReturnType<typeof import("@/lib/investmentMix").normalizeInvestmentMix>;

type ClassificationTableProps = {
    investmentMix: InvestmentMix | null;
    /** Same handler the side list uses: a theme name focuses (a second press clears) that theme. */
    onThemeClickAction: (themeKey: string) => void;
    focusTheme: string | null;
    /** Href of the Evidence tab (carries the page's filters). */
    evidenceHref: string;
};

/**
 * "Explore the classification": the persisted theme mix as a table. Share and value come from
 * the mix only (never from work units). No quality column: production prints no per-theme
 * quality (the treemap tooltip shows one for subcategories only), so none is invented here.
 */
export function ClassificationTable({
    investmentMix,
    onThemeClickAction,
    focusTheme,
    evidenceHref,
}: ClassificationTableProps) {
    const themes = investmentMix ? getSortedThemes(investmentMix) : [];
    if (!investmentMix || themes.length === 0) return null;
    const total = themes.reduce((sum, theme) => sum + theme.value, 0);
    const unit = investmentMix.unit?.replace(/_/g, " ");

    return (
        <Section
            data-testid="classification-section"
            title="Explore the classification"
            description="Select a theme to trace the work behind the mix."
            action={
                <Link href={evidenceHref} className={buttonClassName("ghost", "sm")}>
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    {CTA_LABELS.openEvidence}
                </Link>
            }
        >
            <div className="overflow-hidden rounded-(--radius-md) border border-(--card-stroke)">
                <table className="w-full text-sm" data-testid="classification-table">
                    <thead className="bg-(--card-60) text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                        <tr>
                            <th className="px-4 py-2 text-left font-medium">Theme</th>
                            <th className="px-4 py-2 text-right font-medium">Share</th>
                            <th className="px-4 py-2 text-right font-medium">
                                {unit ? `Effort (${unit})` : "Effort"}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {themes.map((theme) => {
                            return (
                                <tr
                                    key={theme.key}
                                    data-testid="classification-row"
                                    className="border-t border-(--card-stroke)"
                                >
                                    <td className="px-4 py-2">
                                        <button
                                            type="button"
                                            onClick={() => onThemeClickAction(theme.key)}
                                            aria-pressed={focusTheme === theme.key}
                                            className="font-medium text-(--accent-2) hover:underline aria-pressed:underline"
                                        >
                                            {titleCase(theme.key)}
                                        </button>
                                    </td>
                                    <td className="px-4 py-2 text-right tabular-nums">
                                        {formatNumber(total > 0 ? (theme.value / total) * 100 : 0, {
                                            maximumFractionDigits: 1,
                                        })}
                                        %
                                    </td>
                                    <td className="px-4 py-2 text-right tabular-nums">
                                        {formatNumber(theme.value, { maximumFractionDigits: 1 })}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Section>
    );
}
