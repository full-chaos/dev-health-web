import type { ACRContextPacketV1, ACRExpandedEvidenceV1 } from "@/lib/acr/generated";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
    return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(isString);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isOptionalString(value: unknown): boolean {
    return value === undefined || isString(value);
}

function isOptionalRecord(value: unknown): boolean {
    return value === undefined || isRecord(value);
}

function isRelatedEntity(value: unknown): boolean {
    return (
        isRecord(value) &&
        isString(value.type) &&
        isString(value.id) &&
        isString(value.label) &&
        isOptionalString(value.url)
    );
}

function isPacketItem(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return (
        value.schema_version === "context_packet_item.v1" &&
        isString(value.packet_item_id) &&
        isString(value.category) &&
        isString(value.claim_kind) &&
        isString(value.title) &&
        isString(value.summary) &&
        isString(value.why_included) &&
        isString(value.rule_id) &&
        isFiniteNumber(value.confidence) &&
        isString(value.severity) &&
        isFiniteNumber(value.rank) &&
        isRecord(value.validity_scope) &&
        isOptionalString(value.validity_scope.branch) &&
        isOptionalString(value.validity_scope.commit_sha) &&
        isOptionalString(value.validity_scope.valid_from) &&
        isOptionalString(value.validity_scope.valid_to) &&
        isRecord(value.flags) &&
        typeof value.flags.stale === "boolean" &&
        typeof value.flags.uncertain === "boolean" &&
        typeof value.flags.conflicting === "boolean" &&
        typeof value.flags.untrusted_content === "boolean" &&
        Array.isArray(value.related_entities) &&
        value.related_entities.every(isRelatedEntity) &&
        isStringArray(value.evidence_ref_ids)
    );
}

function isRequestedScope(value: unknown): boolean {
    return (
        isRecord(value) &&
        isOptionalString(value.branch) &&
        isOptionalString(value.commit_sha) &&
        isOptionalString(value.task_ref) &&
        (value.files === undefined || isStringArray(value.files)) &&
        (value.as_of === undefined || isString(value.as_of)) &&
        (value.time_window_days === undefined || isFiniteNumber(value.time_window_days))
    );
}

function isCheck(value: unknown, identifier: "check_id" | "step_id"): boolean {
    return (
        isRecord(value) &&
        isString(value[identifier]) &&
        isString(value.label) &&
        isString(value.reason) &&
        isString(value.rule_id)
    );
}

function isWatermark(value: unknown): boolean {
    return (
        isRecord(value) &&
        isString(value.source) &&
        isOptionalString(value.last_ingested_at) &&
        ["fresh", "stale", "missing", "unavailable"].includes(String(value.status))
    );
}

function isUnavailableSource(value: unknown): boolean {
    return isRecord(value) && isString(value.source) && isString(value.reason);
}

function isPacketSections(value: UnknownRecord): boolean {
    const budget = value.budget;
    return (
        isRecord(value.repository) &&
        isString(value.repository.slug) &&
        isOptionalString(value.repository.repo_id) &&
        isOptionalString(value.repository.remote_url) &&
        isRequestedScope(value.requested_scope) &&
        isRecord(value.resolved_scope) &&
        isString(value.resolved_scope.repo_id) &&
        isString(value.resolved_scope.repo_slug) &&
        isOptionalString(value.resolved_scope.branch) &&
        isOptionalString(value.resolved_scope.commit_sha) &&
        ["exact_commit", "branch_filtered", "repo_fallback", "unresolved"].includes(
            String(value.resolved_scope.resolution),
        ) &&
        isStringArray(value.resolved_scope.fallback_reasons) &&
        Array.isArray(value.required_checks) &&
        value.required_checks.every((check) => isCheck(check, "check_id")) &&
        Array.isArray(value.recommended_next_steps) &&
        value.recommended_next_steps.every((step) => isCheck(step, "step_id")) &&
        isRecord(value.freshness) &&
        isString(value.freshness.as_of) &&
        isFiniteNumber(value.freshness.stale_after_seconds) &&
        Array.isArray(value.freshness.watermarks) &&
        value.freshness.watermarks.every(isWatermark) &&
        isRecord(value.coverage) &&
        isStringArray(value.coverage.sources_considered) &&
        isStringArray(value.coverage.sources_available) &&
        Array.isArray(value.coverage.sources_unavailable) &&
        value.coverage.sources_unavailable.every(isUnavailableSource) &&
        typeof value.coverage.partial === "boolean" &&
        isStringArray(value.coverage.degraded_reasons) &&
        isRecord(budget) &&
        [
            "max_items",
            "items_used",
            "max_output_tokens",
            "estimated_tokens",
            "max_serialized_bytes",
            "serialized_bytes",
        ].every((field) => isFiniteNumber(budget[field])) &&
        typeof budget.truncated === "boolean" &&
        isRecord(value.compatibility) &&
        isString(value.compatibility.service_version) &&
        isString(value.compatibility.minimum_sidecar_version) &&
        isStringArray(value.compatibility.supported_schema_versions)
    );
}

export function isContextPacket(value: unknown): value is ACRContextPacketV1 {
    if (!isRecord(value)) return false;
    return (
        value.schema_version === "context_packet.v1" &&
        isString(value.context_packet_id) &&
        isString(value.request_id) &&
        isString(value.generated_at) &&
        ["complete", "partial", "degraded", "empty"].includes(String(value.status)) &&
        isString(value.goal) &&
        isString(value.query_version) &&
        isString(value.ranking_version) &&
        isString(value.summary) &&
        Array.isArray(value.items) &&
        value.items.every(isPacketItem) &&
        isStringArray(value.warnings) &&
        isOptionalString(value.retrieval_debug_summary) &&
        isPacketSections(value)
    );
}

export function isExpandedEvidence(value: unknown): value is ACRExpandedEvidenceV1 {
    if (!isRecord(value) || !isRecord(value.evidence) || !isRecord(value.evidence.source))
        return false;
    return (
        value.schema_version === "expanded_evidence.v1" &&
        isString(value.resolved_at) &&
        ["available", "stale", "redacted", "deleted", "unauthorized"].includes(
            String(value.availability),
        ) &&
        value.evidence.schema_version === "evidence_ref.v1" &&
        isString(value.evidence.evidence_ref_id) &&
        isRecord(value.evidence.source) &&
        isString(value.evidence.source.system) &&
        isString(value.evidence.source.entity_type) &&
        isString(value.evidence.source.entity_id) &&
        isString(value.evidence.source.display_label) &&
        isOptionalString(value.evidence.source.safe_uri) &&
        ["native", "explicit_text", "heuristic", "derived"].includes(
            String(value.evidence.provenance),
        ) &&
        isFiniteNumber(value.evidence.confidence) &&
        isString(value.evidence.citation) &&
        isString(value.evidence.observed_at) &&
        isOptionalString(value.evidence.event_at) &&
        isOptionalString(value.evidence.source_version) &&
        isOptionalString(value.evidence.snapshot_hash) &&
        isOptionalString(value.evidence.content_digest) &&
        ["available", "stale", "redacted", "deleted", "unauthorized"].includes(
            String(value.evidence.availability),
        ) &&
        isOptionalRecord(value.evidence.metadata) &&
        isOptionalString(value.excerpt) &&
        isRecord(value.structured_fields) &&
        isOptionalString(value.redaction_reason)
    );
}
