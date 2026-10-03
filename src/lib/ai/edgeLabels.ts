// Words for Work Graph edge types and node types on AI evidence rows (CHAOS-8093).
// The API serves enum-like tokens (`has_ai_workflow`, `ai_workflow_run`) and no display
// names for edge ends (backend ticket CHAOS-8113). This maps the token to words and falls
// back to a readable form of the token. It never invents a name for an id.

const EDGE_WORDS: Record<string, string> = {
    blocks: "Blocks",
    relates: "Relates to",
    duplicates: "Duplicates",
    is_blocked_by: "Blocked by",
    is_related_to: "Related to",
    is_duplicate_of: "Duplicate of",
    parent_of: "Parent of",
    child_of: "Child of",
    references: "References",
    implements: "Implements",
    fixes: "Fixes",
    contains: "Contains",
    touches: "Touches",
    introduced_by: "Introduced by",
    config_changed_by: "Config changed by",
    guards: "Guards",
    impacts: "Impacts",
    has_ai_workflow: "Has AI workflow",
    generates: "Generates",
    has_review_outcome: "Has review outcome",
    deploys: "Deploys",
    linked_incident: "Linked incident",
};

const NODE_WORDS: Record<string, string> = {
    pr: "Pull request",
    issue: "Issue",
    commit: "Commit",
    file: "File",
    repo: "Repository",
    deployment: "Deployment",
    incident: "Incident",
    ai_workflow_run: "AI workflow run",
};

function readable(token: string): string {
    const words = token.trim().replace(/[_-]+/g, " ").toLowerCase();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : token;
}

export function edgeTypeWords(edgeType: string): string {
    return EDGE_WORDS[edgeType.trim().toLowerCase()] ?? readable(edgeType);
}

export function nodeTypeWords(nodeType: string): string {
    return NODE_WORDS[nodeType.trim().toLowerCase()] ?? readable(nodeType);
}

/** A pull-request node id is `<repo id>:<number>`; the number is the only readable part. */
export function pullRequestNumber(nodeType: string, nodeId: string): string | null {
    if (nodeType.trim().toLowerCase() !== "pr") return null;
    const match = /:(\d+)$/.exec(nodeId);
    return match ? match[1] : null;
}
