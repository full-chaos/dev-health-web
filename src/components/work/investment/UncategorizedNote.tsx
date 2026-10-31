"use client";

import { formatNumber } from "@/lib/formatters";
import { readUncategorizedCoverage } from "@/lib/investment/coverage";

type UncategorizedNoteProps = {
    stats?: { total?: number; uncategorized_count?: number | null } | null;
};

/**
 * How many work units the theme mix leaves out because they have too little text to categorize. They carry
 * no measured split, so the mix never shows them as one; this line says how many there are. Nothing is
 * drawn when none are left out, and a count the API did not send reads "not measured", never 0.
 */
export function UncategorizedNote({ stats }: UncategorizedNoteProps) {
    if (!stats) {
        return null;
    }
    const reading = readUncategorizedCoverage(stats.uncategorized_count, stats.total);
    if (reading.state === "none") {
        return null;
    }
    return (
        <p className="mt-3 text-xs text-(--ink-muted)" data-testid="uncategorized-note">
            {reading.state === "partial"
                ? `${formatNumber(reading.count)} of ${formatNumber(reading.total)} work units have too little text to categorize and are left out of the theme mix.`
                : "Work units left out of the theme mix: not measured."}
        </p>
    );
}
