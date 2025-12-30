export type WorkItemProvider = "jira" | "github" | "gitlab";

export type WorkItemStatusCategory =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done"
  | "canceled"
  | "unknown";

export type WorkItemType =
  | "story"
  | "task"
  | "bug"
  | "epic"
  | "issue"
  | "incident"
  | "chore"
  | "unknown";

export type WorkItemMetricsDaily = {
  day: string;
  provider: WorkItemProvider;
  teamId: string;
  teamName?: string;
  workScopeId: string;
  itemsStarted: number;
  itemsCompleted: number;
  wipCountEndOfDay: number;
  itemsCompletedUnassigned: number;
  bugCompletedRatio: number;
  predictabilityScore: number;
};

export type WorkItemFlowEfficiencyDaily = {
  day: string;
  provider: WorkItemProvider;
  teamId: string;
  teamName?: string;
  workScopeId: string;
  flowEfficiency: number;
};

export type WorkItemTypeSummary = {
  provider: WorkItemProvider;
  teamId: string;
  workScopeId: string;
  type: WorkItemType;
  count: number;
};

export type WorkItemTypeByScope = {
  provider: WorkItemProvider;
  teamId: string;
  workScopeId: string;
  type: WorkItemType;
  count: number;
};

export type WorkItemStatusTransitionSummary = {
  provider: WorkItemProvider;
  teamId: string;
  workScopeId: string;
  fromStatus: WorkItemStatusCategory;
  toStatus: WorkItemStatusCategory;
  count: number;
};

export type FlowTransitionSummary = {
  fromStatus: string;
  toStatus: string;
  count: number;
};
