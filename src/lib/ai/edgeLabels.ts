// Words for Work Graph edge types and node types on AI evidence rows (CHAOS-8093).
// The API serves enum-like tokens (`has_ai_workflow`, `ai_workflow_run`). This maps the token to
// words and falls back to a readable form of the token. The name of an edge end is the served
// `displayName` of its node (CHAOS-8113); nothing here invents a name for an id.

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
    pr: "PR",
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

/** The node fields an edge end is looked up by, and its served name. */
export type NamedNode = { nodeType: string; nodeId: string; displayName?: string | null };

/**
 * The served name of an edge end (CHAOS-8113): the `displayName` of the node with the same type
 * and id. An edge has no name fields, so this is a lookup; nothing is read out of the id. Null
 * when the API serves no name for that node (the caller then shows "Not reported", never the id).
 */
export function edgeEndName(
    nodes: readonly NamedNode[] | null | undefined,
    type: string,
    id: string,
): string | null {
    const node = nodes?.find((candidate) => candidate.nodeType === type && candidate.nodeId === id);
    return node?.displayName?.trim() || null;
}
