import type { AiOpportunity } from "@/lib/graphql/__generated__/types";

export function AIOpportunityList({ detectorReady, recommendations }: { detectorReady?: boolean; recommendations?: AiOpportunity[] }) {
  if (!detectorReady) {
    return (
      <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-80) p-5 text-sm text-(--ink-muted)">
        <p className="font-medium text-foreground">Opportunity engine pending</p>
        <p className="mt-2">Best-fit automation candidates land with CHAOS-1586. This space will suggest repeatable work patterns once that signal becomes available.</p>
      </div>
    );
  }

  if (!recommendations?.length) {
    return <p className="text-sm text-(--ink-muted)">No automation candidates appear in the current scope.</p>;
  }

  return (
    <ol className="space-y-3">
      {recommendations.slice(0, 5).map((item) => (
        <li key={item.opportunityId} className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-(--ink-muted)">{item.rationale}</p>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800">{Math.round(item.score * 100)}%</span>
          </div>
          <p className="mt-2 text-xs uppercase tracking-[0.12em] text-(--ink-muted)">
            {item.kind.replace(/_/g, " ")} {item.repoId ? `· ${item.repoId}` : ""} {item.teamId ? `· ${item.teamId}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
