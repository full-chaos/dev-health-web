"use client";

import {
    PageFactsEvidenceAction,
    type PageFact,
} from "@/components/evidence/PageFactsEvidenceAction";
import { useImproveOpportunities } from "@/lib/graphql/hooks/useImproveOpportunities";

import { kindLabel } from "./ImproveOpportunityList";

/**
 * "View evidence" for Improve / Automations: the tile counts as the page shows them. It reads the
 * same query as the dashboard (same variables, so the client answers from one request). Nothing is
 * drawn while the detector cannot say.
 */
export function AutomationsEvidenceAction() {
    const { data } = useImproveOpportunities();
    const result = data?.improveOpportunities;
    if (!result || result.detectorReady !== true) return null;

    const kinds = new Map<string, number>();
    for (const item of result.opportunities) kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1);
    const facts: PageFact[] = [
        { label: "Detected signals", value: String(result.totalCount) },
        ...[...kinds.entries()].map(([kind, count]) => ({
            label: kindLabel(kind),
            value: String(count),
        })),
    ];
    return <PageFactsEvidenceAction title="Automations" facts={facts} />;
}
