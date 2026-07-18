import type { ACRContextPacketV1, ACRExpandedEvidenceV1 } from "@/lib/acr/generated";

type UnknownRecord = Record<string, unknown>;

const PACKET_CATEGORIES = ["state", "pressure", "cause", "evidence", "action"] as const;
const CLAIM_KINDS = ["observed", "inferred", "recommendation"] as const;
const SEVERITIES = ["info", "warning", "high", "critical"] as const;
const PACKET_STATUSES = ["complete", "partial", "degraded", "empty"] as const;
const RESOLVED_SCOPE_RESOLUTIONS = [
    "exact_commit",
    "branch_filtered",
    "repo_fallback",
    "unresolved",
] as const;
const WATERMARK_STATUSES = ["fresh", "stale", "missing", "unavailable"] as const;
const EVIDENCE_AVAILABILITIES = [
    "available",
    "stale",
    "redacted",
    "deleted",
    "unauthorized",
] as const;
const EVIDENCE_PROVENANCE = ["native", "explicit_text", "heuristic", "derived"] as const;
const RFC3339_TIMESTAMP =
    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
    return typeof value === "string";
}

function isCanonicalValue(value: unknown, allowed: readonly string[]): boolean {
    return isString(value) && allowed.includes(value);
}

function isTimestamp(value: unknown): value is string {
    if (!isString(value) || !RFC3339_TIMESTAMP.test(value)) return false;
    const calendarDate = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    const timestamp = new Date(value);
    return (
        Number.isFinite(timestamp.valueOf()) &&
        calendarDate.getUTCFullYear() === Number(value.slice(0, 4)) &&
        calendarDate.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
        calendarDate.getUTCDate() === Number(value.slice(8, 10))
    );
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

function isOptionalTimestamp(value: unknown): boolean {
    return value === undefined || isTimestamp(value);
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
        isCanonicalValue(value.category, PACKET_CATEGORIES) &&
        isCanonicalValue(value.claim_kind, CLAIM_KINDS) &&
        isString(value.title) &&
        isString(value.summary) &&
        isString(value.why_included) &&
        isString(value.rule_id) &&
        isFiniteNumber(value.confidence) &&
        isCanonicalValue(value.severity, SEVERITIES) &&
        isFiniteNumber(value.rank) &&
        isRecord(value.validity_scope) &&
        isOptionalString(value.validity_scope.branch) &&
        isOptionalString(value.validity_scope.commit_sha) &&
        isOptionalTimestamp(value.validity_scope.valid_from) &&
        isOptionalTimestamp(value.validity_scope.valid_to) &&
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
        isOptionalTimestamp(value.as_of) &&
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
        isOptionalTimestamp(value.last_ingested_at) &&
        isCanonicalValue(value.status, WATERMARK_STATUSES)
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
        isCanonicalValue(value.resolved_scope.resolution, RESOLVED_SCOPE_RESOLUTIONS) &&
        isStringArray(value.resolved_scope.fallback_reasons) &&
        Array.isArray(value.required_checks) &&
        value.required_checks.every((check) => isCheck(check, "check_id")) &&
        Array.isArray(value.recommended_next_steps) &&
        value.recommended_next_steps.every((step) => isCheck(step, "step_id")) &&
        isRecord(value.freshness) &&
        isTimestamp(value.freshness.as_of) &&
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
        isTimestamp(value.generated_at) &&
        isCanonicalValue(value.status, PACKET_STATUSES) &&
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
        isTimestamp(value.resolved_at) &&
        isCanonicalValue(value.availability, EVIDENCE_AVAILABILITIES) &&
        value.evidence.schema_version === "evidence_ref.v1" &&
        isString(value.evidence.evidence_ref_id) &&
        isRecord(value.evidence.source) &&
        isString(value.evidence.source.system) &&
        isString(value.evidence.source.entity_type) &&
        isString(value.evidence.source.entity_id) &&
        isString(value.evidence.source.display_label) &&
        isOptionalString(value.evidence.source.safe_uri) &&
        isCanonicalValue(value.evidence.provenance, EVIDENCE_PROVENANCE) &&
        isFiniteNumber(value.evidence.confidence) &&
        isString(value.evidence.citation) &&
        isTimestamp(value.evidence.observed_at) &&
        isOptionalTimestamp(value.evidence.event_at) &&
        isOptionalString(value.evidence.source_version) &&
        isOptionalString(value.evidence.snapshot_hash) &&
        isOptionalString(value.evidence.content_digest) &&
        isCanonicalValue(value.evidence.availability, EVIDENCE_AVAILABILITIES) &&
        isOptionalRecord(value.evidence.metadata) &&
        isOptionalString(value.excerpt) &&
        isRecord(value.structured_fields) &&
        isOptionalString(value.redaction_reason)
    );
}
