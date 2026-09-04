import { navTitleForPathname } from "@/lib/navigation/areas";

import type { DevScope, DevScopeContract } from "./generated";

type DevEntityRef = DevScopeContract.DevEntityRef;
type DevSurfaceContext = DevScopeContract.DevSurfaceContext;

export const ASK_DEV_APPROVED_ROUTE_IDS = [
    "diagnose_overview",
    "flow_metrics",
    "investment",
    "work_graph",
    "complexity",
    "cognitive_load",
    "bottlenecks",
    "repository_detail",
    "project_detail",
    "work_unit_detail",
    "issue_detail",
    "pull_request_detail",
    "data_health",
] as const;

export type ApprovedAskDevRouteId = (typeof ASK_DEV_APPROVED_ROUTE_IDS)[number];
export type ApprovedAskDevEntityType = DevEntityRef["entity_type"];

/**
 * Canonical route for the Data Confidence admin destination. Shared between
 * the pathname match below and the entry-point label derivation so the two
 * can never point at different pages.
 */
const DATA_HEALTH_PATH = "/data-health";

export const ASK_DEV_SUGGESTED_QUESTION_IDS = [
    "delivery_status",
    "remaining_work",
    "observed_change",
    "metric_definition",
    "data_trust",
] as const;

export type AskDevSuggestedQuestionId = (typeof ASK_DEV_SUGGESTED_QUESTION_IDS)[number];

export const ASK_DEV_SUGGESTED_QUESTIONS: Readonly<Record<AskDevSuggestedQuestionId, string>> = {
    delivery_status: "What does the evidence suggest about delivery status?",
    remaining_work: "What work appears to remain in this scope?",
    observed_change: "What changed in this scope during the selected time range?",
    metric_definition: "How are the registered metrics in this scope defined?",
    data_trust: "How complete and fresh is the evidence for this scope?",
};

type ApprovedRouteDefinition = {
    label: string;
    allowEmptyEntityRefs: boolean;
    allowedEntityTypes: readonly ApprovedAskDevEntityType[];
    suggestedQuestionIds: readonly AskDevSuggestedQuestionId[];
};

/**
 * Repository-owned contextual-entry-point allowlist.
 *
 * Supporting-evidence routes such as deployments, incidents, commits, reviews,
 * files, CI/test runs, and AI runs are intentionally absent. Adding a route or
 * entity type here requires matching authorization/resolution coverage in Ops.
 */
export const ASK_DEV_CONTEXTUAL_ENTRYPOINTS = {
    diagnose_overview: {
        label: "Diagnose overview",
        allowEmptyEntityRefs: true,
        allowedEntityTypes: ["repository"],
        suggestedQuestionIds: ["delivery_status", "observed_change", "data_trust"],
    },
    flow_metrics: {
        label: "Flow metrics",
        allowEmptyEntityRefs: true,
        allowedEntityTypes: ["repository"],
        suggestedQuestionIds: ["delivery_status", "observed_change", "metric_definition"],
    },
    investment: {
        label: "Investment",
        allowEmptyEntityRefs: true,
        allowedEntityTypes: ["repository"],
        suggestedQuestionIds: ["observed_change", "remaining_work", "data_trust"],
    },
    work_graph: {
        label: "Work Graph",
        allowEmptyEntityRefs: false,
        allowedEntityTypes: ["repository", "project", "work_unit", "issue", "pull_request"],
        suggestedQuestionIds: ["remaining_work", "delivery_status", "data_trust"],
    },
    complexity: {
        label: "Complexity",
        allowEmptyEntityRefs: false,
        allowedEntityTypes: ["repository"],
        suggestedQuestionIds: ["observed_change", "data_trust"],
    },
    cognitive_load: {
        label: "Cognitive Load",
        allowEmptyEntityRefs: true,
        allowedEntityTypes: ["repository"],
        suggestedQuestionIds: ["observed_change", "data_trust"],
    },
    bottlenecks: {
        label: "Bottlenecks",
        allowEmptyEntityRefs: true,
        allowedEntityTypes: ["repository", "project"],
        suggestedQuestionIds: ["delivery_status", "remaining_work", "observed_change"],
    },
    repository_detail: {
        label: "Repository",
        allowEmptyEntityRefs: false,
        allowedEntityTypes: ["repository"],
        suggestedQuestionIds: ["delivery_status", "observed_change", "data_trust"],
    },
    project_detail: {
        label: "Project",
        allowEmptyEntityRefs: false,
        allowedEntityTypes: ["project"],
        suggestedQuestionIds: ["delivery_status", "remaining_work", "data_trust"],
    },
    work_unit_detail: {
        label: "Work unit",
        allowEmptyEntityRefs: false,
        allowedEntityTypes: ["work_unit"],
        suggestedQuestionIds: ["delivery_status", "remaining_work", "data_trust"],
    },
    issue_detail: {
        label: "Issue",
        allowEmptyEntityRefs: false,
        allowedEntityTypes: ["issue"],
        suggestedQuestionIds: ["delivery_status", "remaining_work", "data_trust"],
    },
    pull_request_detail: {
        label: "Pull request",
        allowEmptyEntityRefs: false,
        allowedEntityTypes: ["pull_request"],
        suggestedQuestionIds: ["delivery_status", "remaining_work", "data_trust"],
    },
    data_health: {
        // Derived, not hardcoded: `/lib/navigation/areas.ts` is the single
        // source of truth for destination labels (sidebar, breadcrumbs, page
        // title). Hardcoding a second copy here is exactly what drifted out
        // of sync with the "Data Confidence" rename (CHAOS-3397).
        label: navTitleForPathname(DATA_HEALTH_PATH),
        allowEmptyEntityRefs: true,
        allowedEntityTypes: ["repository"],
        suggestedQuestionIds: ["data_trust", "observed_change"],
    },
} as const satisfies Readonly<Record<ApprovedAskDevRouteId, ApprovedRouteDefinition>>;

export type AskDevSurfaceContext = {
    routeId: ApprovedAskDevRouteId;
    entityRefs: readonly DevEntityRef[];
    filterFingerprint?: string;
    suggestedQuestionIds?: readonly AskDevSuggestedQuestionId[];
};

const SAFE_OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,127}$/;
const SAFE_FILTER_FINGERPRINT = /^filter-v1-[a-f0-9]{8}$/;
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
const CONTEXT_KEYS = new Set([
    "routeId",
    "entityRefs",
    "filterFingerprint",
    "suggestedQuestionIds",
]);
const ENTITY_REF_KEYS = new Set(["entity_type", "entity_id", "display_label", "repository_id"]);

function hasUniqueRefs(refs: readonly DevEntityRef[]): boolean {
    const keys = refs.map((ref) => `${ref.entity_type}:${ref.entity_id}`);
    return new Set(keys).size === keys.length;
}

/**
 * CHAOS-3478: identity check for binding a clarification-candidate selection
 * to the exact candidate list the answer that rendered it carried.
 *
 * `AskDevProvider.selectProposedEntity` used to apply any structurally valid
 * entity ref to `proposedScope` without proving it came from the current
 * answer's candidate list — a structurally valid but foreign entity,
 * reaching the caller through a malformed or manipulated answer payload,
 * would have been committed. Server-side reauthorization on the NEXT
 * question remains the actual enforcement boundary (`ScopeResolutionService.resolve`
 * re-derives `org_id` itself and re-checks the catalog), so this is defense
 * in depth, not the sole guard — but the client should not rely entirely on
 * that downstream check when a local check is this cheap.
 *
 * Compares by `(entity_type, entity_id)` — the same identity key
 * `hasUniqueRefs` above uses — never by `display_label`, which is
 * presentation text, not part of the entity's identity.
 */
export function isEntityRefAmongCandidates(
    entity: Pick<DevEntityRef, "entity_type" | "entity_id">,
    candidates: readonly Pick<DevEntityRef, "entity_type" | "entity_id">[],
): boolean {
    return candidates.some(
        (candidate) =>
            candidate.entity_type === entity.entity_type &&
            candidate.entity_id === entity.entity_id,
    );
}

/**
 * Runtime validation protects the client handoff even when a context crosses
 * a server/client serialization boundary. It accepts IDs and display labels,
 * never arbitrary page text, URLs, prompts, screenshots, HTML, or DOM content.
 */
export function isApprovedAskDevSurfaceContext(value: unknown): value is AskDevSurfaceContext {
    if (!value || typeof value !== "object") return false;
    const context = value as Partial<AskDevSurfaceContext> & Record<string, unknown>;
    if (
        Object.keys(context).some((key) => !CONTEXT_KEYS.has(key)) ||
        !ASK_DEV_APPROVED_ROUTE_IDS.includes(context.routeId as ApprovedAskDevRouteId) ||
        !Array.isArray(context.entityRefs) ||
        context.entityRefs.length > 20 ||
        !hasUniqueRefs(context.entityRefs)
    ) {
        return false;
    }

    const route: ApprovedRouteDefinition =
        ASK_DEV_CONTEXTUAL_ENTRYPOINTS[context.routeId as ApprovedAskDevRouteId];
    if (!route.allowEmptyEntityRefs && context.entityRefs.length === 0) return false;
    const hasMultipleDirectEntities =
        context.entityRefs.length > 1 &&
        context.entityRefs.some((ref) => ref.entity_type !== "repository");
    if (hasMultipleDirectEntities) return false;
    const refsAreSafe = context.entityRefs.every((ref) => {
        if (!ref || typeof ref !== "object") return false;
        return (
            Object.keys(ref).every((key) => ENTITY_REF_KEYS.has(key)) &&
            route.allowedEntityTypes.includes(ref.entity_type) &&
            SAFE_OPAQUE_ID.test(ref.entity_id) &&
            !URL_SCHEME.test(ref.entity_id) &&
            ref.display_label.trim().length > 0 &&
            ref.display_label.length <= 120 &&
            !/[\u0000-\u001f\u007f<>]/.test(ref.display_label) &&
            !URL_SCHEME.test(ref.display_label) &&
            (ref.repository_id == null ||
                (SAFE_OPAQUE_ID.test(ref.repository_id) && !URL_SCHEME.test(ref.repository_id)))
        );
    });
    if (!refsAreSafe) return false;

    if (
        context.filterFingerprint !== undefined &&
        !SAFE_FILTER_FINGERPRINT.test(context.filterFingerprint)
    ) {
        return false;
    }

    if (context.suggestedQuestionIds !== undefined) {
        if (!Array.isArray(context.suggestedQuestionIds)) return false;
        const ids = context.suggestedQuestionIds as readonly AskDevSuggestedQuestionId[];
        if (
            new Set(ids).size !== ids.length ||
            ids.some((id) => !route.suggestedQuestionIds.includes(id))
        ) {
            return false;
        }
    }

    return true;
}

export function askDevSurfaceContextLabel(context: AskDevSurfaceContext): string {
    const routeLabel = ASK_DEV_CONTEXTUAL_ENTRYPOINTS[context.routeId].label;
    const entityLabels = context.entityRefs.map((ref) => ref.display_label);
    if (entityLabels.length === 0) {
        return context.filterFingerprint ? `${routeLabel} · current filters` : routeLabel;
    }
    const shown = entityLabels.slice(0, 2).join(", ");
    const remainder = entityLabels.length - 2;
    return `${routeLabel} · ${shown}${remainder > 0 ? ` +${remainder}` : ""}`;
}

export function askDevSuggestedQuestions(
    context: AskDevSurfaceContext,
): readonly { id: AskDevSuggestedQuestionId; label: string }[] {
    const ids =
        context.suggestedQuestionIds ??
        ASK_DEV_CONTEXTUAL_ENTRYPOINTS[context.routeId].suggestedQuestionIds;
    return ids.map((id) => ({ id, label: ASK_DEV_SUGGESTED_QUESTIONS[id] }));
}

export function toDevSurfaceContext(context: AskDevSurfaceContext): DevSurfaceContext {
    return {
        route_id: context.routeId,
        entity_refs: context.entityRefs.map((ref) => ({
            ...ref,
        })) as DevSurfaceContext["entity_refs"],
        ...(context.filterFingerprint ? { filter_fingerprint: context.filterFingerprint } : {}),
    };
}

export function askDevDirectScope(
    context: AskDevSurfaceContext,
): Pick<DevScope, "direct_scope" | "entity_refs" | "repositories"> {
    if (context.entityRefs.length === 0) {
        return { direct_scope: "organization", entity_refs: [], repositories: [] };
    }
    if (context.entityRefs.every((ref) => ref.entity_type === "repository")) {
        return {
            direct_scope: "repository",
            entity_refs: [],
            repositories: context.entityRefs.map(
                (ref) => ref.entity_id,
            ) as DevScope["repositories"],
        };
    }
    const [entityRef] = context.entityRefs;
    return {
        direct_scope: entityRef.entity_type,
        entity_refs: [{ ...entityRef }] as DevScope["entity_refs"],
        repositories: (entityRef.repository_id
            ? [entityRef.repository_id]
            : []) as DevScope["repositories"],
    };
}

const APPROVED_EMPTY_CONTEXT_PATHS: Readonly<
    Record<
        string,
        Extract<
            ApprovedAskDevRouteId,
            "diagnose_overview" | "flow_metrics" | "investment" | "cognitive_load" | "bottlenecks"
        >
    >
> = {
    "/diagnose": "diagnose_overview",
    "/metrics": "flow_metrics",
    "/investment": "investment",
    "/cognitive-load": "cognitive_load",
    "/bottleneck": "bottlenecks",
};

/**
 * True for `/data-health` itself and any of its descendants
 * (`/data-health/connectors`, `/data-health/identity`, ...). A bare
 * `startsWith(DATA_HEALTH_PATH)` also matches an unrelated sibling route that
 * merely shares the prefix (e.g. a hypothetical `/data-health-legacy`) --
 * this requires the boundary to be the path itself or a `/`-delimited
 * descendant (CHAOS-3410 codex round).
 */
function isDataHealthPathname(pathname: string): boolean {
    return pathname === DATA_HEALTH_PATH || pathname.startsWith(`${DATA_HEALTH_PATH}/`);
}

/** Resolve only approved pages where an organization-level context is valid. */
export function askDevContextForPathname(
    pathname: string,
    filterFingerprint?: string,
): AskDevSurfaceContext | null {
    const routeId = isDataHealthPathname(pathname)
        ? "data_health"
        : APPROVED_EMPTY_CONTEXT_PATHS[pathname];
    if (!routeId) return null;
    const context: AskDevSurfaceContext = {
        routeId,
        entityRefs: [],
        ...(filterFingerprint ? { filterFingerprint } : {}),
    };
    return isApprovedAskDevSurfaceContext(context) ? context : null;
}

/** Produce a non-reversible, stable identifier; never send the filter payload. */
export function fingerprintAskDevFilter(serializedApprovedFilter: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < serializedApprovedFilter.length; index += 1) {
        hash ^= serializedApprovedFilter.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `filter-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
