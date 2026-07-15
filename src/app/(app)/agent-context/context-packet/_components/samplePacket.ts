import type { ACRContextPacketV1, ACRExpandedEvidenceV1 } from "@/lib/acr/generated";

export const SAMPLE_CONTEXT_PACKET: ACRContextPacketV1 = {
    schema_version: "context_packet.v1",
    context_packet_id: "pkt_01J0ACR001",
    request_id: "req_01J0ACR001",
    generated_at: "2026-07-10T14:00:00Z",
    status: "complete",
    goal: "Add repository-scoped ACR credentials",
    repository: { slug: "full-chaos/dev-health-acr" },
    requested_scope: { branch: "main", commit_sha: "22e472d", task_ref: "CHAOS-2924" },
    resolved_scope: {
        repo_id: "repo_dev_health_acr",
        repo_slug: "full-chaos/dev-health-acr",
        branch: "main",
        commit_sha: "22e472d",
        resolution: "exact_commit",
        fallback_reasons: [],
    },
    query_version: "context-query.v1",
    ranking_version: "ranker.v1",
    summary: "Repository-scoped credentials are required before exposing the read API.",
    items: [
        {
            schema_version: "context_packet_item.v1",
            packet_item_id: "item_01J0ACR001",
            category: "pressure",
            claim_kind: "observed",
            title: "Credential scope must be repository constrained",
            summary:
                "The requested task changes ACR client credential authorization and must preserve repository-level scope checks.",
            why_included:
                "The task references the credential lifecycle and repository authorization contract.",
            rule_id: "auth.repo_scope.required.v1",
            confidence: 0.98,
            severity: "high",
            rank: 1,
            validity_scope: {
                branch: "main",
                commit_sha: "22e472d",
                valid_from: "2026-07-10T14:00:00Z",
            },
            flags: { stale: false, uncertain: false, conflicting: false, untrusted_content: false },
            related_entities: [
                {
                    type: "linear_issue",
                    id: "CHAOS-2924",
                    label: "Implement scoped client credentials and repository authorization",
                },
            ],
            evidence_ref_ids: ["ev_01J0ACR001"],
        },
    ],
    required_checks: [
        {
            check_id: "check_repo_scope",
            label: "Test cross-repository denial",
            reason: "Credentials must never read evidence outside their repository allowlist.",
            rule_id: "auth.repo_scope.required.v1",
        },
    ],
    recommended_next_steps: [
        {
            step_id: "step_token_hash",
            label: "Implement hashed fcacr_ bearer tokens",
            reason: "The sidecar credential must be separate from product entitlement and never stored plaintext.",
            rule_id: "auth.token.hash.v1",
        },
    ],
    freshness: {
        as_of: "2026-07-10T14:00:00Z",
        stale_after_seconds: 86400,
        watermarks: [
            { source: "linear", last_ingested_at: "2026-07-10T14:00:00Z", status: "fresh" },
            { source: "github", last_ingested_at: "2026-07-10T14:00:00Z", status: "fresh" },
        ],
    },
    coverage: {
        sources_considered: ["linear", "github", "clickhouse_work_graph"],
        sources_available: ["linear", "github", "clickhouse_work_graph"],
        sources_unavailable: [],
        partial: false,
        degraded_reasons: [],
    },
    budget: {
        max_items: 30,
        items_used: 1,
        max_output_tokens: 4000,
        estimated_tokens: 380,
        max_serialized_bytes: 262144,
        serialized_bytes: 4210,
        truncated: false,
    },
    warnings: [],
    compatibility: {
        service_version: "0.1.0",
        minimum_sidecar_version: "0.1.0",
        supported_schema_versions: [
            "context_packet.v1",
            "context_packet_item.v1",
            "evidence_ref.v1",
        ],
    },
};

export const SAMPLE_PARTIAL_CONTEXT_PACKET: ACRContextPacketV1 = {
    ...SAMPLE_CONTEXT_PACKET,
    status: "partial",
    coverage: {
        ...SAMPLE_CONTEXT_PACKET.coverage,
        sources_available: ["linear", "github"],
        sources_unavailable: [
            {
                source: "clickhouse_work_graph",
                reason: "Demo fixture does not include hosted ClickHouse",
            },
        ],
        partial: true,
    },
};

export const SAMPLE_DEGRADED_CONTEXT_PACKET: ACRContextPacketV1 = {
    ...SAMPLE_PARTIAL_CONTEXT_PACKET,
    status: "degraded",
    coverage: {
        ...SAMPLE_PARTIAL_CONTEXT_PACKET.coverage,
        degraded_reasons: ["Hosted evidence is unavailable in this demo fixture."],
    },
};

export const SAMPLE_EXPANDED_EVIDENCE: Record<string, ACRExpandedEvidenceV1> = {
    ev_01J0ACR001: {
        schema_version: "expanded_evidence.v1",
        evidence: {
            schema_version: "evidence_ref.v1",
            evidence_ref_id: "ev_01J0ACR001",
            source: {
                system: "linear",
                entity_type: "issue",
                entity_id: "CHAOS-2924",
                display_label: "Credential authorization review",
                safe_uri: "https://linear.app/fullchaos/issue/CHAOS-2924",
            },
            provenance: "native",
            confidence: 0.98,
            citation: "Repository credential requirements",
            observed_at: "2026-07-10T14:00:00Z",
            availability: "available",
        },
        resolved_at: "2026-07-10T14:00:00Z",
        availability: "available",
        excerpt: "Repository-scoped credentials must be checked before evidence access.",
        structured_fields: {},
    },
};
