type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecords(value: unknown): JsonRecord[] {
    return Array.isArray(value) && value.every(isRecord) ? value : [];
}

function hasUniqueStrings(value: unknown): boolean {
    return Array.isArray(value) && value.every((item) => typeof item === "string")
        ? new Set(value).size === value.length
        : false;
}

const SURFACE_ENTITY_TYPES: Readonly<Record<string, ReadonlySet<string>>> = {
    diagnose_overview: new Set(["repository"]),
    flow_metrics: new Set(["repository"]),
    investment: new Set(["repository"]),
    work_graph: new Set(["repository", "project", "work_unit", "issue", "pull_request"]),
    complexity: new Set(["repository"]),
    cognitive_load: new Set(["repository"]),
    bottlenecks: new Set(["repository", "project"]),
    repository_detail: new Set(["repository"]),
    project_detail: new Set(["project"]),
    work_unit_detail: new Set(["work_unit"]),
    issue_detail: new Set(["issue"]),
    pull_request_detail: new Set(["pull_request"]),
    data_health: new Set(["repository"]),
};

const ORGANIZATION_SURFACE_ROUTES = new Set([
    "diagnose_overview",
    "flow_metrics",
    "investment",
    "cognitive_load",
    "bottlenecks",
    "data_health",
]);

function validateSurfaceContext(scope: JsonRecord, entityRefs: JsonRecord[]): boolean {
    if (scope.surface_context == null) return true;
    if (!isRecord(scope.surface_context)) return false;
    const routeId = scope.surface_context.route_id;
    const surfaceRefs = asRecords(scope.surface_context.entity_refs);
    if (typeof routeId !== "string" || !(routeId in SURFACE_ENTITY_TYPES)) return false;
    const uniqueRefs = new Set(
        surfaceRefs.map((ref) => `${String(ref.entity_type)}:${String(ref.entity_id)}`),
    );
    if (uniqueRefs.size !== surfaceRefs.length) return false;
    if (surfaceRefs.length === 0) {
        return ORGANIZATION_SURFACE_ROUTES.has(routeId) && scope.direct_scope === "organization";
    }
    const allowedTypes = SURFACE_ENTITY_TYPES[routeId]!;
    if (surfaceRefs.some((ref) => !allowedTypes.has(String(ref.entity_type)))) return false;
    if (surfaceRefs.every((ref) => ref.entity_type === "repository")) {
        const surfaceIds = new Set(surfaceRefs.map((ref) => ref.entity_id));
        const repositoryIds = new Set(scope.repositories as unknown[]);
        return (
            scope.direct_scope === "repository" &&
            surfaceIds.size === repositoryIds.size &&
            [...surfaceIds].every((id) => repositoryIds.has(id))
        );
    }
    if (surfaceRefs.length !== 1 || entityRefs.length !== 1) return false;
    return (
        scope.direct_scope === surfaceRefs[0]!.entity_type &&
        entityRefs[0]!.entity_type === surfaceRefs[0]!.entity_type &&
        entityRefs[0]!.entity_id === surfaceRefs[0]!.entity_id
    );
}

function validateScope(scope: JsonRecord): boolean {
    const repositories = scope.repositories;
    const teamIds = scope.team_ids;
    if (!hasUniqueStrings(repositories) || !hasUniqueStrings(teamIds)) return false;

    const entityRefs = asRecords(scope.entity_refs);
    const directScope = scope.direct_scope;
    if (directScope === "organization" && entityRefs.length > 0) return false;
    if (directScope === "repository" && (repositories as unknown[]).length === 0) return false;

    const expectedEntityType: Record<string, string> = {
        project: "project",
        work_unit: "work_unit",
        issue: "issue",
        pull_request: "pull_request",
        team: "team",
    };
    if (
        typeof directScope === "string" &&
        directScope in expectedEntityType &&
        (entityRefs.length !== 1 || entityRefs[0]?.entity_type !== expectedEntityType[directScope])
    ) {
        return false;
    }
    if (directScope === "team") {
        // CHAOS-3301: a team *subject* and the pre-existing team_ids *filter*
        // stay structurally separate. team_ids must name exactly the one
        // committed team, and a team scope carries no repository list of its
        // own — team-to-repository attribution is re-derived server-side, so
        // a foreign `repositories` list here would otherwise be consumed by
        // the status source seam rather than rejected.
        const teamIdList = teamIds as unknown[];
        if (teamIdList.length !== 1 || teamIdList[0] !== entityRefs[0]?.entity_id) return false;
        if ((repositories as unknown[]).length > 0) return false;
    }
    if (!validateSurfaceContext(scope, entityRefs)) return false;

    if (isRecord(scope.comparison_range) && isRecord(scope.time_range)) {
        const currentDuration =
            Date.parse(String(scope.time_range.end)) - Date.parse(String(scope.time_range.start));
        const comparisonDuration =
            Date.parse(String(scope.comparison_range.end)) -
            Date.parse(String(scope.comparison_range.start));
        if (currentDuration !== comparisonDuration) return false;
    }
    return true;
}

/**
 * Outcomes that ops requires a `resolved_scope` for, mirroring
 * `DevScopeResolution.validate_outcome`. This one is exported because it
 * fails OPEN on drift: a new "resolved" outcome missing from this set makes
 * web accept a resolution ops would reject, silently. The pinned enum's
 * remaining members are the unresolved side of the partition, and
 * `contracts.test.ts` holds the two against the schema.
 */
export const SCOPE_OUTCOMES_REQUIRING_RESOLVED_SCOPE: ReadonlySet<string> = new Set([
    "exact",
    "filtered",
    "inherited",
    "organization_fallback",
]);

export const SCOPE_OUTCOMES_WITHOUT_RESOLVED_SCOPE: ReadonlySet<string> = new Set([
    "ambiguous",
    "unresolved",
    "forbidden_or_not_found",
]);

/**
 * Outcomes a resolution may carry `candidates` for, mirroring ops
 * `contracts.CANDIDATE_BEARING_OUTCOMES` (CHAOS-3367). This one fails CLOSED
 * on drift — a new candidate-bearing outcome missing from this set makes web
 * reject a payload ops would accept, which surfaces as a visible validation
 * failure rather than as silently-accepted contradictory data.
 */
export const CANDIDATE_BEARING_SCOPE_OUTCOMES: ReadonlySet<string> = new Set([
    "ambiguous",
    "forbidden_or_not_found",
]);

function validateScopeResolution(resolution: JsonRecord): boolean {
    const outcome = resolution.outcome;
    const candidates = asRecords(resolution.candidates);
    const resolvedScope = resolution.resolved_scope;
    const resolvedOutcomes = SCOPE_OUTCOMES_REQUIRING_RESOLVED_SCOPE;
    if (typeof outcome === "string" && resolvedOutcomes.has(outcome) && !isRecord(resolvedScope)) {
        return false;
    }
    // Mirrors ops `DevScopeResolution.CANDIDATE_BEARING_OUTCOMES`. `ambiguous`
    // REQUIRES candidates; `forbidden_or_not_found` MAY carry them — the PRD's
    // no-match sentence ends "Here are the closest matches, if any", and the
    // closest-match list lives here rather than in a second, parallel field
    // (CHAOS-3367; CHAOS-3366 fills it). Every other outcome still forbids
    // them: an `exact` commit with candidates beside it is a contradiction.
    if (outcome === "ambiguous" && candidates.length === 0) return false;
    if (!CANDIDATE_BEARING_SCOPE_OUTCOMES.has(String(outcome)) && candidates.length > 0)
        return false;
    return !(
        outcome === "organization_fallback" &&
        (!isRecord(resolvedScope) || resolvedScope.direct_scope !== "organization")
    );
}

function validateClaim(claim: JsonRecord): boolean {
    const evidenceIds = Array.isArray(claim.evidence_ref_ids) ? claim.evidence_ref_ids : [];
    const metricIds = Array.isArray(claim.metric_ref_ids) ? claim.metric_ref_ids : [];
    if (claim.kind === "observed" && evidenceIds.length === 0 && metricIds.length === 0)
        return false;
    if (claim.kind === "inferred" && Number(claim.confidence) >= 1) return false;
    if (claim.kind === "recommendation")
        return typeof claim.recommendation_rule_version === "string";
    return claim.recommendation_rule_version == null;
}

function referencesOnlyKnown(ids: unknown, known: ReadonlySet<unknown>): boolean {
    return Array.isArray(ids) && ids.every((id) => known.has(id));
}

function validateAnswer(answer: JsonRecord): boolean {
    const evidence = asRecords(answer.evidence);
    const metrics = asRecords(answer.metrics);
    const claims = asRecords(answer.claims);
    const conflicts = asRecords(answer.conflicts);
    const evidenceIds = evidence.map((item) => item.evidence_ref_id);
    const metricIds = metrics.map((item) => item.metric_ref_id);
    if (new Set(evidenceIds).size !== evidenceIds.length) return false;
    if (new Set(metricIds).size !== metricIds.length) return false;

    const knownEvidence = new Set(evidenceIds);
    const knownMetrics = new Set(metricIds);
    if (
        claims.some(
            (claim) =>
                !referencesOnlyKnown(claim.evidence_ref_ids, knownEvidence) ||
                !referencesOnlyKnown(claim.metric_ref_ids, knownMetrics),
        ) ||
        conflicts.some(
            (conflict) => !referencesOnlyKnown(conflict.evidence_ref_ids, knownEvidence),
        ) ||
        metrics.some((metric) => !referencesOnlyKnown(metric.evidence_ref_ids, knownEvidence))
    ) {
        return false;
    }

    // `graph_assisted.ranked_drivers[].evidence_ref_ids` and
    // `conflicting_evidence_ref_ids` cite into this SAME
    // answer's `evidence[]` array -- ops documents this on
    // `DevAnswerDriverEntry` and enforces it server-side
    // (`DevAnswer.validate_answer_invariants`). Schema-only surface today (no
    // W3-W5 rendering here), but the citation-closure rule still has to hold
    // wherever `graph_assisted` is present, the same as every other
    // evidence-citing array above; `graph_assisted` itself is optional and
    // `None`/absent outside a completed, cohort-shaped answer.
    const graphAssisted = answer.graph_assisted;
    if (isRecord(graphAssisted)) {
        const rankedDrivers = asRecords(graphAssisted.ranked_drivers);
        if (
            rankedDrivers.some(
                (driver) =>
                    !referencesOnlyKnown(driver.evidence_ref_ids, knownEvidence) ||
                    !referencesOnlyKnown(driver.conflicting_evidence_ref_ids ?? [], knownEvidence),
            )
        ) {
            return false;
        }
    }

    // Mirrors `fully_covered` in ops' v2->v1 projector
    // (contracts_v2/compat.py): an answered outcome becomes `complete` only
    // when the counts agree AND all three required-source lists are empty.
    // `degraded_required_sources` was missing here, so web accepted a
    // `complete` answer ops cannot emit — the same omission as the coverage
    // block that never rendered the field (CHAOS-3469), in a second place.
    // There is no pinned negative example for it; ops did not ship one.
    //
    // The new clause treats an ABSENT list as satisfied, deliberately: all
    // three lists are optional in `DevCoverage` (only the two counts and
    // `as_of` are required), and absent means empty, which is exactly when
    // `complete` is legal. Note the asymmetry this exposes — the two older
    // clauses demand `Array.isArray(...)` and so reject a schema-valid
    // `complete` answer that simply omits an optional list. Ops always
    // serialises them, so nothing hits it today; left as-is rather than
    // loosened here, because relaxing an existing acceptance rule is a
    // contract decision and not part of this row.
    const coverage = answer.coverage;
    if (answer.status === "complete" && isRecord(coverage)) {
        return (
            coverage.available_source_count === coverage.required_source_count &&
            Array.isArray(coverage.unavailable_required_sources) &&
            coverage.unavailable_required_sources.length === 0 &&
            Array.isArray(coverage.stale_required_sources) &&
            coverage.stale_required_sources.length === 0 &&
            (coverage.degraded_required_sources === undefined ||
                (Array.isArray(coverage.degraded_required_sources) &&
                    coverage.degraded_required_sources.length === 0))
        );
    }
    return true;
}

function validateToolResult(result: JsonRecord): boolean {
    if (result.status === "error" ? !isRecord(result.error) : result.error != null) return false;

    const knownEvidence = new Set(asRecords(result.evidence).map((item) => item.evidence_ref_id));
    const citing = [
        ...asRecords(result.status_facts),
        ...asRecords(result.graph_edges),
        ...asRecords(result.pull_requests),
        ...asRecords(result.ci_checks),
        ...asRecords(result.deployments),
        ...asRecords(result.incidents),
    ];
    const completion = result.actual_completion;
    if (isRecord(completion)) {
        citing.push(
            completion,
            ...asRecords(completion.required_children),
            ...asRecords(completion.conflicts),
        );
    }
    return citing.every((fact) => referencesOnlyKnown(fact.evidence_ref_ids ?? [], knownEvidence));
}

function validateStreamEvent(event: JsonRecord): boolean {
    const payloadByEvent: Record<string, string | undefined> = {
        "run.started": undefined,
        "scope.resolved": "scope_resolution",
        progress: "progress",
        "graph.state": "graph_state",
        "answer.delta": "delta",
        "answer.completed": "answer",
        warning: "warning",
        error: "error",
        done: "terminal_kind",
    };
    if (typeof event.event !== "string" || !(event.event in payloadByEvent)) return false;
    const expectedPayload = payloadByEvent[event.event];
    const payloadNames = [
        "progress",
        "scope_resolution",
        "graph_state",
        "delta",
        "answer",
        "warning",
        "error",
        "terminal_kind",
    ];
    return payloadNames.every((name) =>
        name === expectedPayload ? event[name] != null : event[name] == null,
    );
}

function validateTranscriptEntry(entry: JsonRecord): boolean {
    if (entry.role === "user") {
        return (
            typeof entry.question === "string" &&
            new TextEncoder().encode(entry.question).byteLength <= 8_192 &&
            isRecord(entry.scope) &&
            entry.answer == null
        );
    }
    if (entry.role === "assistant") {
        return entry.question == null && entry.scope == null && isRecord(entry.answer);
    }
    return false;
}

function validateConversationTranscript(transcript: JsonRecord): boolean {
    const items = asRecords(transcript.items);
    const messageIds = items.map((item) => item.message_id);
    if (new Set(messageIds).size !== messageIds.length) return false;

    const ordering = items.map(
        (item) => [Date.parse(String(item.created_at)), String(item.message_id)] as const,
    );
    if (
        ordering.some((value, index) => {
            if (index === 0) return false;
            const previous = ordering[index - 1]!;
            return value[0] < previous[0] || (value[0] === previous[0] && value[1] < previous[1]);
        })
    ) {
        return false;
    }

    return items.every(
        (item) =>
            item.answer == null ||
            (isRecord(item.answer) && item.answer.conversation_id === transcript.conversation_id),
    );
}

function validateOneSemanticObject(value: JsonRecord): boolean {
    switch (value.schema_version) {
        case "dev_scope.v1":
            return validateScope(value);
        case "dev_scope_resolution.v1":
            return validateScopeResolution(value);
        case "dev_claim.v1":
            return validateClaim(value);
        case "dev_answer.v1":
            return validateAnswer(value);
        case "dev_message_request.v1":
            return (
                typeof value.question === "string" &&
                new TextEncoder().encode(value.question).byteLength <= 8_192
            );
        case "dev_metric_ref.v1":
            return value.value != null || (Array.isArray(value.series) && value.series.length > 0);
        case "dev_evidence_expansion.v1":
            return (
                typeof value.serialized_bytes === "number" &&
                value.serialized_bytes ===
                    new TextEncoder().encode(
                        typeof value.safe_excerpt === "string" ? value.safe_excerpt : "",
                    ).byteLength
            );
        case "dev_tool_result.v1":
            return validateToolResult(value);
        case "dev_stream_event.v1":
            return validateStreamEvent(value);
        case "dev_transcript_entry.v1":
            return validateTranscriptEntry(value);
        case "dev_conversation_transcript.v1":
            return validateConversationTranscript(value);
        default:
            return true;
    }
}

/**
 * Validate semantics that Draft 2020-12 cannot express after schema validation.
 * Nested versioned contract objects are checked too, so a valid outer schema
 * cannot hide an invalid scope, claim, or reference closure.
 */
export function validateAskDevSemanticInvariants(value: unknown): boolean {
    if (Array.isArray(value)) return value.every(validateAskDevSemanticInvariants);
    if (!isRecord(value)) return true;
    return (
        validateOneSemanticObject(value) &&
        Object.values(value).every(validateAskDevSemanticInvariants)
    );
}

/** Validate one bounded Ask Dev stream after every event passes its JSON schema. */
export function validateAskDevStream(value: unknown): boolean {
    if (!Array.isArray(value) || value.length === 0 || value.length > 100_000) return false;
    if (!value.every(isRecord) || !validateAskDevSemanticInvariants(value)) return false;
    const events = value as JsonRecord[];
    if (new Set(events.map((event) => event.run_id)).size !== 1) return false;
    if (!events.every((event, index) => event.sequence === index)) return false;
    if (events[0]?.event !== "run.started") return false;

    const terminalIndexes = events.flatMap((event, index) =>
        event.event === "answer.completed" || event.event === "error" ? [index] : [],
    );
    if (terminalIndexes.length !== 1) return false;
    const terminalIndex = terminalIndexes[0];
    if (terminalIndex !== events.length - 2 || events.at(-1)?.event !== "done") return false;
    const terminalKind = events[terminalIndex]?.event === "answer.completed" ? "answer" : "error";
    return events.at(-1)?.terminal_kind === terminalKind;
}
