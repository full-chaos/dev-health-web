import type {
  WorkItemStatusCategory,
  WorkItemType,
} from "./devHealthOpsTypes";

const toTitleCase = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");

const workItemTypeLabels: Record<WorkItemType, string> = {
  story: "Story",
  task: "Task",
  bug: "Bug",
  epic: "Epic",
  issue: "Issue",
  incident: "Incident",
  chore: "Chore",
  unknown: "Unknown",
};

const workItemStatusLabels: Record<WorkItemStatusCategory, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  blocked: "Blocked",
  done: "Done",
  canceled: "Canceled",
  unknown: "Unknown",
};

export const translateWorkItemType = (type: WorkItemType) =>
  workItemTypeLabels[type] ?? workItemTypeLabels.unknown;

export const translateStatusCategory = (status: WorkItemStatusCategory) =>
  workItemStatusLabels[status] ?? workItemStatusLabels.unknown;

export const translateWorkScopeId = (scopeId: string) =>
  scopeId ? toTitleCase(scopeId) : "Unscoped";

export const translateTeamLabel = (teamName?: string, teamId?: string) => {
  if (teamName && teamName.trim()) {
    return teamName.trim();
  }
  if (teamId && teamId.trim()) {
    return toTitleCase(teamId.trim());
  }
  return "Unassigned";
};
