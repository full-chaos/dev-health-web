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
        typeof value.confidence === "number" &&
        isString(value.severity) &&
        Array.isArray(value.related_entities) &&
        isStringArray(value.evidence_ref_ids)
    );
}

function isPacketSection(value: unknown, fields: readonly string[]): value is UnknownRecord {
    return isRecord(value) && fields.every((field) => field in value);
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
        isPacketSection(value.repository, ["slug"]) &&
        isPacketSection(value.requested_scope, []) &&
        isPacketSection(value.resolved_scope, [
            "repo_id",
            "repo_slug",
            "resolution",
            "fallback_reasons",
        ]) &&
        isString(value.query_version) &&
        isString(value.ranking_version) &&
        isString(value.summary) &&
        Array.isArray(value.items) &&
        value.items.every(isPacketItem) &&
        Array.isArray(value.required_checks) &&
        Array.isArray(value.recommended_next_steps) &&
        isPacketSection(value.freshness, ["as_of", "stale_after_seconds", "watermarks"]) &&
        isPacketSection(value.coverage, [
            "sources_considered",
            "sources_available",
            "sources_unavailable",
            "partial",
            "degraded_reasons",
        ]) &&
        isPacketSection(value.budget, [
            "max_items",
            "items_used",
            "max_output_tokens",
            "estimated_tokens",
            "max_serialized_bytes",
            "serialized_bytes",
            "truncated",
        ]) &&
        isStringArray(value.warnings) &&
        isPacketSection(value.compatibility, [
            "service_version",
            "minimum_sidecar_version",
            "supported_schema_versions",
        ])
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
        isString(value.evidence.evidence_ref_id) &&
        isString(value.evidence.citation) &&
        isString(value.evidence.source.display_label) &&
        isRecord(value.structured_fields)
    );
}
