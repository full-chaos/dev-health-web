"use client";

import { ErrorCard } from "@/components/ui/ErrorCard";
import type { AIFilter } from "@/lib/filters/ai";
import { useAIOpportunities } from "@/lib/graphql/hooks/useAIImpact";
import { AIEmptyState } from "./AIEmptyState";
import { AIOpportunityList } from "./AIOpportunityList";
import { AIPanelCard } from "./AIPanelCard";

type AIAutomationsDashboardProps = {
  filter: AIFilter;
};

export function AIAutomationsDashboard({ filter }: AIAutomationsDashboardProps) {
  const opportunitiesResult = useAIOpportunities(filter);
  const opportunities = opportunitiesResult.data?.aiOpportunities;

  if (opportunitiesResult.error) {
    return (
      <ErrorCard
        title="AI automation opportunities could not load"
        message={opportunitiesResult.error.message ?? "Please retry the request."}
      />
    );
  }

  if (opportunitiesResult.fetching && !opportunities) {
    return <AutomationsSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="ai-automations-dashboard">
      <AIPanelCard
        title="Best-fit automation opportunities"
        description="Candidate patterns for responsible automation once the recommendation engine becomes ready."
      >
        <AIOpportunityList detectorReady={opportunities?.detectorReady} recommendations={opportunities?.recommendations} />
      </AIPanelCard>
    </div>
  );
}

function AutomationsSkeleton() {
  return (
    <div className="rounded-3xl border border-(--card-stroke) bg-card p-5" data-testid="ai-automations-loading">
      <div className="h-40 animate-pulse rounded-2xl bg-(--card-80)" />
    </div>
  );
}
