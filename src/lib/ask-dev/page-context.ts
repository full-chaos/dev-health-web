import type { SubjectHint } from "@/lib/acr/generated";

import { nonBlank, SUBJECT_KIND_VOCABULARY, type SubjectHintKind } from "./conversation";

/**
 * The typed page-context registry and route map of Ask Dev (plan §2.4, item I-20, CHAOS-11936).
 *
 * A page may propose the entities it shows to Ask Dev; the proposal becomes ACR
 * `requested_scope.subject_hints[]` and nothing else. A hint never binds a subject: ACR resolves it
 * again and authorizes every call. This module is the closed vocabulary behind that:
 *
 * - **Routes:** only the approved V1 contextual surfaces (CHAOS-3216), remapped to the current
 *   App Router pages. Any other page proposes nothing.
 * - **Kinds:** every ACR subject kind is either a direct scope or supporting evidence. Evidence-only
 *   kinds (deployment, incident, CI run, review, ...) never become a hint (CHAOS-3216: "supporting
 *   evidence rather than approved direct scopes"). Each route takes only the scope kinds it lists.
 * - **Content:** a proposal carries kind, id and label, rebuilt field by field. No DOM text and no
 *   filter state (CHAOS-3584) can travel with it.
 *
 * Showing the proposal as chips, removing it, and sending it with a question is I-22 (CHAOS-3584).
 * Pure: no React, no request.
 */

type Role = "scope" | "evidence";

/**
 * Every ACR subject kind, classified once. Keyed by `SubjectHintKind`, so a contract pin that adds a
 * kind is a compile error here until someone decides which side it is on.
 */
export const SUBJECT_KIND_ROLE: Readonly<Record<SubjectHintKind, Role>> = {
    organization: "scope",
    team: "scope",
    project: "scope",
    repository: "scope",
    work_item: "scope",
    pull_request: "scope",
    deployment: "evidence",
    incident: "evidence",
    ci_pipeline_run: "evidence",
    pull_request_review: "evidence",
    document: "evidence",
    decision: "evidence",
    episode: "evidence",
    metric: "evidence",
    // A non-authoritative stub of an unresolved cross-system reference (acr devhealthsource).
    work_item_ref: "evidence",
};

/** The direct-scope kinds a page may propose. */
export type ScopeKind =
    "organization" | "team" | "project" | "repository" | "work_item" | "pull_request";

export const SCOPE_KINDS: readonly ScopeKind[] = SUBJECT_KIND_VOCABULARY.filter(
    (kind): kind is ScopeKind => SUBJECT_KIND_ROLE[kind] === "scope",
);

/**
 * The approved contextual surfaces (CHAOS-3216 V1), by stable id. Repository detail and
 * project/work-unit detail have no page today, so they have no id yet.
 */
export type ApprovedRouteId =
    | "diagnose_overview"
    | "flow_metrics"
    | "investment"
    | "work_graph"
    | "complexity"
    | "cognitive_load"
    | "bottlenecks"
    | "work_item_detail"
    | "pull_request_detail"
    | "data_health";

export type PageContextRoute = {
    /** App Router patterns of the page (`[name]` is one dynamic segment). */
    readonly paths: readonly string[];
    /** The scope kinds the page may propose. */
    readonly kinds: readonly ScopeKind[];
};

/** The route map: each approved surface, its current pages and the kinds it may propose. */
export const PAGE_CONTEXT_ROUTES: Readonly<Record<ApprovedRouteId, PageContextRoute>> = {
    diagnose_overview: { paths: ["/diagnose"], kinds: ["organization", "repository"] },
    flow_metrics: { paths: ["/metrics"], kinds: ["organization", "repository", "team"] },
    investment: { paths: ["/investment"], kinds: ["organization", "repository", "team"] },
    work_graph: {
        paths: ["/diagnose/work-graph"],
        kinds: ["project", "work_item", "pull_request", "repository"],
    },
    complexity: { paths: ["/complexity"], kinds: ["repository"] },
    cognitive_load: { paths: ["/cognitive-load"], kinds: ["organization", "repository", "team"] },
    bottlenecks: {
        paths: ["/bottleneck"],
        kinds: ["organization", "repository", "project", "team"],
    },
    work_item_detail: { paths: ["/issues/[issue_id]"], kinds: ["work_item"] },
    pull_request_detail: { paths: ["/prs/[pr_id]"], kinds: ["pull_request"] },
    data_health: { paths: ["/data-health"], kinds: ["organization", "repository"] },
};

export const APPROVED_ROUTE_IDS = Object.keys(PAGE_CONTEXT_ROUTES) as ApprovedRouteId[];

/** `SubjectHint.source` of every page-context hint: caller-authored, never an engine source. */
export const PAGE_CONTEXT_HINT_SOURCE = "ask_dev_page_context";

/** The most entities one page proposes (ACR takes 50 hints; a page shows a few). */
export const MAX_PAGE_CONTEXT_REFS = 10;
/** ACR's bounds on `SubjectHint.id` and `SubjectHint.label` (`context_fabric_common.v1`). */
const MAX_ID_LENGTH = 256;
const MAX_LABEL_LENGTH = 512;

const DYNAMIC_SEGMENT = /^\[[^\]/]+\]$/u;
const CONTROL_CHARACTER = /\p{Cc}/u;

const segmentsOf = (path: string) => path.split("/").filter((segment) => segment !== "");

// No two patterns overlap; the enumerated test maps every page back to its own id, so an
// overlap added later fails there.
const ROUTE_PATTERNS = APPROVED_ROUTE_IDS.flatMap((id) =>
    PAGE_CONTEXT_ROUTES[id].paths.map((path) => ({ id, segments: segmentsOf(path) })),
);

/** The approved surface a pathname is on, or `null` (every other page proposes nothing). */
export function routeIdForPath(pathname: string): ApprovedRouteId | null {
    const segments = segmentsOf(pathname);
    if (segments.length === 0) return null;
    const match = ROUTE_PATTERNS.find(
        (pattern) =>
            pattern.segments.length === segments.length &&
            pattern.segments.every(
                (expected, index) => DYNAMIC_SEGMENT.test(expected) || expected === segments[index],
            ),
    );
    return match?.id ?? null;
}

/** One entity a page shows, as the page states it. */
export type PageEntityInput = {
    readonly kind: string;
    readonly id: string;
    readonly label: string;
};

export type PageEntityRef = {
    readonly kind: ScopeKind;
    readonly id: string;
    readonly label: string;
};

export type DropReason =
    "unknown_kind" | "evidence_only" | "not_for_route" | "invalid_ref" | "duplicate" | "over_limit";

export type PageContextProposal = {
    readonly routeId: ApprovedRouteId;
    readonly entityRefs: readonly PageEntityRef[];
    /** What was left out and why, by kind only (never an id or a label). */
    readonly dropped: readonly { readonly kind: string; readonly reason: DropReason }[];
};

const isKnownKind = (kind: string): kind is SubjectHintKind =>
    Object.hasOwn(SUBJECT_KIND_ROLE, kind);

/** Characters as ACR's JSON Schema counts them (`maxLength`): code points, not UTF-16 units. */
const characterCount = (value: string) => [...value].length;

const validText = (value: string, max: number) =>
    nonBlank(value) !== undefined && characterCount(value) <= max && !CONTROL_CHARACTER.test(value);

/**
 * The page's proposal, checked against the registry: `null` off an approved surface, else the
 * entities the surface may propose (in order, without duplicates, at most `MAX_PAGE_CONTEXT_REFS`)
 * and what was dropped.
 */
export function proposePageContext(input: {
    readonly pathname: string;
    readonly entityRefs: readonly PageEntityInput[];
}): PageContextProposal | null {
    const routeId = routeIdForPath(input.pathname);
    if (routeId === null) return null;
    const allowed: readonly string[] = PAGE_CONTEXT_ROUTES[routeId].kinds;
    const entityRefs: PageEntityRef[] = [];
    const dropped: { kind: string; reason: DropReason }[] = [];
    const seen = new Set<string>();
    for (const ref of input.entityRefs) {
        const drop = (reason: DropReason) => dropped.push({ kind: ref.kind, reason });
        if (!isKnownKind(ref.kind)) drop("unknown_kind");
        else if (SUBJECT_KIND_ROLE[ref.kind] === "evidence") drop("evidence_only");
        else if (!allowed.includes(ref.kind)) drop("not_for_route");
        else if (!validText(ref.id, MAX_ID_LENGTH) || !validText(ref.label, MAX_LABEL_LENGTH)) {
            drop("invalid_ref");
        } else if (seen.has(JSON.stringify([ref.kind, ref.id]))) drop("duplicate");
        else if (entityRefs.length >= MAX_PAGE_CONTEXT_REFS) drop("over_limit");
        else {
            seen.add(JSON.stringify([ref.kind, ref.id]));
            // Rebuilt field by field: whatever else the page's object holds stays behind.
            entityRefs.push({ kind: ref.kind as ScopeKind, id: ref.id, label: ref.label });
        }
    }
    return { routeId, entityRefs, dropped };
}

/** The proposal as ACR subject hints: kind, id, label and the page-context source, nothing else. */
export function toSubjectHints(proposal: PageContextProposal): SubjectHint[] {
    return proposal.entityRefs.map((ref) => ({
        kind: ref.kind,
        id: ref.id,
        label: ref.label,
        source: PAGE_CONTEXT_HINT_SOURCE,
    }));
}
