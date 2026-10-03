import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonClassName } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import { withFilterParam } from "@/lib/filters/url";
import { getTabSet, tabHref } from "@/lib/navigation/tabs";

type InvestigateTestOpsProps = {
    filters: MetricFilter;
    role?: string;
};

/**
 * The "Investigate TestOps" section card: one row per TestOps detail tab (Pipelines, Tests,
 * Coverage) with an "Open" action (approved `.worklist` / `.workrow`). The rows come from the
 * tab registry, so they cannot drift from the tab row; each link keeps the scope and window.
 */
export function InvestigateTestOps({ filters, role }: InvestigateTestOpsProps) {
    const set = getTabSet("testops");
    const rows = set.tabs.filter((tab) => tab.id !== set.defaultTabId);

    return (
        <Section title="Investigate TestOps" data-testid="testops-investigate">
            <ul>
                {rows.map((tab) => (
                    <li
                        key={tab.id}
                        data-testid="testops-investigate-row"
                        className="flex items-center justify-between gap-4 border-b border-(--card-stroke) px-4.75 py-4.5"
                    >
                        <strong className="text-sm font-semibold text-foreground">
                            {tab.label}
                        </strong>
                        <Link
                            href={withFilterParam(tabHref(set, tab.id), filters, role)}
                            aria-label={`${CTA_LABELS.open} ${tab.label}`}
                            className={buttonClassName("ghost", "sm")}
                        >
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                            {CTA_LABELS.open}
                        </Link>
                    </li>
                ))}
            </ul>
        </Section>
    );
}
