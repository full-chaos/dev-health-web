// Words for Work Graph edge types and node types on AI evidence rows (CHAOS-8093).
// The API serves enum-like tokens (`has_ai_workflow`, `ai_workflow_run`). This maps the token to
// words and falls back to a readable form of the token. The name of an edge end is the served
// `displayName` of its node (CHAOS-8113); nothing here invents a name for an id.

import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";

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

/** The node fields an edge end is looked up by, its served name and the served name flag. */
export type NamedNode = {
    nodeType: string;
    nodeId: string;
    displayName?: string | null;
    /**
     * Served by the API: true = nodes of this type carry a name (a null name is a gap), false = the
     * type has no name by design. Absent on an older answer.
     */
    nameExpected?: boolean | null;
};

/** What an edge end has in place of an id. */
export type EdgeEndName =
    /** The served name of its node. */
    | { kind: "name"; name: string }
    /** The node's type has no name by design (the served flag says so). */
    | { kind: "no-name" }
    /** A name is expected and none is served, or the answer has no such node or no flag. */
    | { kind: "not-reported" };

/**
 * The name of an edge end (CHAOS-8113): the served `displayName` of the node with the same type
 * and id. An edge has no name fields, so this is a lookup; nothing is read out of the id. With no
 * served name, the served `nameExpected` flag of the node decides: false = the type has no name
 * (the type words stand alone), anything else = "not reported". The web keeps no list of types,
 * and it does not say "no name by design" without the served flag.
 */
export function edgeEndName(
    nodes: readonly NamedNode[] | null | undefined,
    type: string,
    id: string,
): EdgeEndName {
    const node = nodes?.find((candidate) => candidate.nodeType === type && candidate.nodeId === id);
    const name = node?.displayName?.trim();
    if (name) return { kind: "name", name };
    return node?.nameExpected === false ? { kind: "no-name" } : { kind: "not-reported" };
}

/** One edge end in words: the words of its type, then its served name or "Not reported". */
export function edgeEndWords(type: string, end: EdgeEndName): string {
    const words = nodeTypeWords(type);
    if (end.kind === "name") return `${words} ${end.name}`;
    return end.kind === "no-name" ? words : `${words} ${NOT_REPORTED}`;
}
