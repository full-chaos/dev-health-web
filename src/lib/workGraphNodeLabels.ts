import type { WorkGraphNodeType } from "@/lib/graphql/types";

/** Plain label of each Work Graph node type. Exhaustive: a new schema value fails the type check. */
export const NODE_TYPE_LABELS: Record<WorkGraphNodeType, string> = {
    ISSUE: "Issue",
    PR: "Pull Request",
    COMMIT: "Commit",
    FILE: "File",
    RELEASE: "Release",
    FEATURE_FLAG: "Feature Flag",
    AI_WORKFLOW_RUN: "AI Workflow",
    DIFF: "Diff",
    REVIEW_OUTCOME: "Review",
    DEPLOYMENT: "Deployment",
    INCIDENT: "Incident",
    OPERATIONAL_SERVICE: "Service",
    OPERATIONAL_ALERT: "Alert",
    INCIDENT_TIMELINE_EVENT: "Incident timeline event",
    INCIDENT_RESPONDER: "Incident responder",
    ESCALATION_POLICY: "Escalation policy",
    REPOSITORY: "Repository",
    USER: "User",
    TEAM: "Team",
};
