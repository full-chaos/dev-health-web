"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { PageFactsEvidenceAction } from "@/components/evidence/PageFactsEvidenceAction";
import type { MetricFilter } from "@/lib/filters/types";
import { useWorkGraphArtifacts, useWorkGraphFlow } from "@/lib/graphql/hooks";
import { useOrgId } from "@/lib/graphql/provider";
import type { WorkGraphEdgeFilterInput } from "@/lib/graphql/types";

import { artifactEvidenceFacts, flowEvidenceFacts, getGraphSearchState } from "./GraphView";

const FLOW_TABS = new Set(["overview", "dependencies", "inflow-outflow"]);

/**
 * "View evidence" for every Work Graph tab but Review Network (that one is built in the page): the page's served values as fact
 * rows, in the body's order. It reads the same aggregate as the tab (same scope, so the client
 * cache answers); each query is paused unless its tab is active. Nothing is drawn while the
 * aggregate is loading, failed or empty.
 */
export function WorkGraphEvidenceAction({
    filters,
    activeTab,
}: {
    filters: MetricFilter;
    activeTab: string;
}) {
    const searchParams = useSearchParams();
    const contextOrgId = useOrgId();
    const orgId = filters.scope.ids[0] || contextOrgId || "";
    const { theme, subcategory } = useMemo(() => getGraphSearchState(searchParams), [searchParams]);
    const aggregate = useMemo<WorkGraphEdgeFilterInput>(
        () => ({
            repoIds: filters.what?.repos,
            ...(theme !== "all" ? { theme } : {}),
            ...(subcategory !== "all" ? { subcategory } : {}),
        }),
        [filters.what?.repos, theme, subcategory],
    );
    const artifactFilters = useMemo<WorkGraphEdgeFilterInput>(
        () => ({ ...aggregate, limit: 50 }),
        [aggregate],
    );
    const flow = useWorkGraphFlow({
        orgId,
        filters: aggregate,
        pause: !orgId || !FLOW_TABS.has(activeTab),
    });
    const artifacts = useWorkGraphArtifacts({
        orgId,
        filters: artifactFilters,
        pause: !orgId || activeTab !== "artifacts",
    });

    if (activeTab === "overview" || activeTab === "dependencies") {
        // The graph tabs' evidence is the served entity-type aggregate for the same scope.
        const facts = flowEvidenceFacts(flow.rows);
        return facts.length ? <PageFactsEvidenceAction title="Work Graph" facts={facts} /> : null;
    }
    if (activeTab === "inflow-outflow") {
        const facts = flowEvidenceFacts(flow.rows);
        return facts.length ? (
            <PageFactsEvidenceAction title="Inflow / Outflow" facts={facts} />
        ) : null;
    }
    if (activeTab === "artifacts") {
        const facts = artifactEvidenceFacts(artifacts.rows);
        return facts.length ? (
            <PageFactsEvidenceAction title="Artifact browser" facts={facts} />
        ) : null;
    }
    return null;
}
