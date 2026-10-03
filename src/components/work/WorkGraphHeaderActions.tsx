import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonClassName } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";
import { buildExploreUrl } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";

/** Tabs whose page used to carry "Open evidence" in the explorer card head. */
const EVIDENCE_TABS = new Set(["overview", "dependencies"]);

type WorkGraphHeaderActionsProps = {
    filters: MetricFilter;
    activeTab: string;
    role?: string;
    origin?: string;
};

/**
 * PageHeader actions of the Work Graph page: "Open evidence" (scope-preserving /explore link),
 * moved here from the explorer card head. Same URL, same tabs as before (overview, dependencies).
 */
export function WorkGraphHeaderActions({
    filters,
    activeTab,
    role,
    origin,
}: WorkGraphHeaderActionsProps) {
    if (!EVIDENCE_TABS.has(activeTab)) return null;
    return (
        <Link
            href={buildExploreUrl({ metric: "throughput", filters, role, origin })}
            className={buttonClassName("ghost")}
        >
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
            {CTA_LABELS.openEvidence}
        </Link>
    );
}
