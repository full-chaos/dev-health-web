export interface ACRClientCredentialMetadataV1 {
    schema_version: "acr_client_credential.v1";
    credential_id: string;
    name: string;
    token_prefix: string;
    org_id: string;
    repository_scopes: string[];
    /**
     * @minItems 1
     */
    scopes: [
        "context:read" | "evidence:read" | "episode:write",
        ...("context:read" | "evidence:read" | "episode:write")[],
    ];
    created_at: string;
    expires_at: string | null;
    revoked_at: string | null;
    last_used_at: string | null;
}

export interface ACRAgentEpisodeV1 {
    schema_version: "agent_episode.v1";
    client_episode_id: string;
    idempotency_key: string;
    context_packet_id: string;
    goal: string;
    task_ref?: string;
    repository: {
        slug: string;
        repo_id?: string;
        remote_url?: string;
    };
    scope: {
        branch?: string;
        commit_sha?: string;
    };
    client: {
        name: string;
        version: string;
        sidecar_version: string;
        agent_name?: string;
        model?: string;
    };
    started_at: string;
    ended_at: string;
    outcome: "succeeded" | "failed" | "abandoned" | "superseded" | "unknown";
    summary: string;
    artifacts: {
        /**
         * @maxItems 500
         */
        files_touched: string[];
        /**
         * @maxItems 100
         */
        artifact_uris: string[];
        /**
         * @maxItems 200
         */
        tests_run: string[];
    };
    transcript: {
        mode: "none" | "opaque_ref" | "redacted_summary";
        opaque_ref?: string;
        redacted_summary?: string;
    };
    retention_class: "default_90d" | "short_30d" | "legal_hold" | "no_persist";
    episode_id: string;
    created_at: string;
    redaction_state: "active" | "redacted" | "purged_tombstone";
    duplicate?: boolean;
}

export interface ACRAgentEpisodeCreateV1 {
    schema_version: "agent_episode_create.v1";
    client_episode_id: string;
    idempotency_key: string;
    context_packet_id: string;
    goal: string;
    task_ref?: string;
    repository: {
        slug: string;
        repo_id?: string;
        remote_url?: string;
    };
    scope: {
        branch?: string;
        commit_sha?: string;
    };
    client: {
        name: string;
        version: string;
        sidecar_version: string;
        agent_name?: string;
        model?: string;
    };
    started_at: string;
    ended_at: string;
    outcome: "succeeded" | "failed" | "abandoned" | "superseded" | "unknown";
    summary: string;
    artifacts: {
        /**
         * @maxItems 500
         */
        files_touched: string[];
        /**
         * @maxItems 100
         */
        artifact_uris: string[];
        /**
         * @maxItems 200
         */
        tests_run: string[];
    };
    transcript: {
        mode: "none" | "opaque_ref" | "redacted_summary";
        opaque_ref?: string;
        redacted_summary?: string;
    };
    retention_class: "default_90d" | "short_30d" | "legal_hold" | "no_persist";
}

export interface ACRCapabilitiesV1 {
    schema_version: "capabilities.v1";
    service: "dev-health-acr";
    service_version: string;
    minimum_sidecar_version: string;
    /**
     * @minItems 1
     */
    supported_schema_versions: [string, ...string[]];
    enabled_tools: ("context_for_task" | "source_evidence" | "record_episode")[];
    entitlements: {
        agent_context_runtime: boolean;
    };
    limits: {
        max_items: number;
        max_output_tokens: number;
        max_serialized_bytes: number;
        requests_per_minute: number;
    };
    generated_at: string;
    permissions: {
        context_read: boolean;
        evidence_read: boolean;
        episode_write: boolean;
    };
}

export interface ACRContextPacketV1 {
    schema_version: "context_packet.v1";
    context_packet_id: string;
    request_id: string;
    generated_at: string;
    status: "complete" | "partial" | "degraded" | "empty";
    goal: string;
    repository: {
        slug: string;
        repo_id?: string;
        remote_url?: string;
    };
    requested_scope: {
        branch?: string;
        commit_sha?: string;
        task_ref?: string;
        /**
         * @maxItems 200
         */
        files?: string[];
        as_of?: string;
        time_window_days?: number;
    };
    resolved_scope: {
        repo_id: string;
        repo_slug: string;
        branch?: string;
        commit_sha?: string;
        resolution: "exact_commit" | "branch_filtered" | "repo_fallback" | "unresolved";
        fallback_reasons: string[];
    };
    query_version: string;
    ranking_version: string;
    summary: string;
    /**
     * @maxItems 50
     */
    items: ACRContextPacketItemV1[];
    /**
     * @maxItems 100
     */
    required_checks: {
        check_id: string;
        label: string;
        reason: string;
        rule_id: string;
    }[];
    /**
     * @maxItems 100
     */
    recommended_next_steps: {
        step_id: string;
        label: string;
        reason: string;
        rule_id: string;
    }[];
    freshness: {
        as_of: string;
        stale_after_seconds: number;
        watermarks: {
            source: string;
            last_ingested_at?: string;
            status: "fresh" | "stale" | "missing" | "unavailable";
        }[];
    };
    coverage: {
        sources_considered: string[];
        sources_available: string[];
        sources_unavailable: {
            source: string;
            reason: string;
        }[];
        partial: boolean;
        degraded_reasons: string[];
    };
    budget: {
        max_items: number;
        items_used: number;
        max_output_tokens: number;
        estimated_tokens: number;
        max_serialized_bytes: number;
        serialized_bytes: number;
        truncated: boolean;
    };
    warnings: string[];
    compatibility: {
        service_version: string;
        minimum_sidecar_version: string;
        supported_schema_versions: string[];
    };
    retrieval_debug_summary?: string;
}

export type ACRContextPacketItemV1 = {
    [k: string]: unknown | undefined;
} & {
    schema_version: "context_packet_item.v1";
    packet_item_id: string;
    category: "state" | "pressure" | "cause" | "evidence" | "action";
    claim_kind: "observed" | "inferred" | "recommendation";
    title: string;
    summary: string;
    why_included: string;
    rule_id: string;
    confidence: number;
    severity: "info" | "warning" | "high" | "critical";
    rank: number;
    validity_scope: {
        branch?: string;
        commit_sha?: string;
        valid_from?: string;
        valid_to?: string;
    };
    flags: {
        stale: boolean;
        uncertain: boolean;
        conflicting: boolean;
        untrusted_content: boolean;
    };
    /**
     * @maxItems 100
     */
    related_entities: {
        type: string;
        id: string;
        label: string;
        url?: string;
    }[];
    /**
     * @maxItems 100
     */
    evidence_ref_ids: string[];
};

export interface ACRContextPacketRequestV1 {
    schema_version: "context_packet_request.v1";
    request_id: string;
    goal: string;
    repository: {
        slug: string;
        repo_id?: string;
        remote_url?: string;
    };
    scope: {
        branch?: string;
        commit_sha?: string;
        task_ref?: string;
        /**
         * @maxItems 200
         */
        files?: string[];
        as_of?: string;
        time_window_days?: number;
    };
    options: {
        requested_categories?: ("state" | "pressure" | "cause" | "evidence" | "action")[];
        max_items: number;
        max_output_tokens: number;
        max_serialized_bytes: number;
        include_debug: boolean;
        include_low_confidence: boolean;
    };
    client: {
        name: string;
        version: string;
        sidecar_version?: string;
    };
}

export interface ACRErrorV1 {
    schema_version: "error.v1";
    request_id: string;
    error: {
        code:
            | "invalid_request"
            | "invalid_token"
            | "insufficient_scope"
            | "feature_not_enabled"
            | "repo_forbidden"
            | "not_found"
            | "rate_limited"
            | "version_mismatch"
            | "upstream_unavailable"
            | "internal_error";
        message: string;
        http_status: number;
        retryable: boolean;
        details?: {
            [k: string]: unknown | undefined;
        };
    };
}

export interface ACREvidenceReferenceV1 {
    schema_version: "evidence_ref.v1";
    evidence_ref_id: string;
    source: {
        system: string;
        entity_type: string;
        entity_id: string;
        display_label: string;
        safe_uri?: string;
    };
    provenance: "native" | "explicit_text" | "heuristic" | "derived";
    confidence: number;
    citation: string;
    observed_at: string;
    event_at?: string;
    source_version?: string;
    snapshot_hash?: string;
    content_digest?: string;
    availability: "available" | "stale" | "redacted" | "deleted" | "unauthorized";
    metadata?: {
        [k: string]: unknown | undefined;
    };
}

export interface ACRExpandedEvidenceV1 {
    schema_version: "expanded_evidence.v1";
    evidence: ACREvidenceReferenceV1;
    resolved_at: string;
    availability: "available" | "stale" | "redacted" | "deleted" | "unauthorized";
    excerpt?: string;
    structured_fields: {
        [k: string]: unknown | undefined;
    };
    redaction_reason?: string;
}
