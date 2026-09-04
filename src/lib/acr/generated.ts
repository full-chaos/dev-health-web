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
        "context:read" | "evidence:read" | "episode:write" | "context:admin",
        ...("context:read" | "evidence:read" | "episode:write" | "context:admin")[],
    ];
    created_at: string;
    expires_at: string | null;
    revoked_at: string | null;
    last_used_at: string | null;
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

export interface ACRContextFabricCommonShapesV1 {
    [k: string]: unknown | undefined;
}

export interface ACRContextFabricInvestigationRequestV1 {
    schema_version: "context_fabric_investigation_request.v1";
    request_id: string;
    question: string;
    /**
     * @maxItems 50
     */
    conversation?: ConversationTurn[];
    /**
     * @maxItems 20
     */
    prior_subject_receipts?:
        | []
        | [BoundSubjectReceipt]
        | [BoundSubjectReceipt, BoundSubjectReceipt]
        | [BoundSubjectReceipt, BoundSubjectReceipt, BoundSubjectReceipt]
        | [BoundSubjectReceipt, BoundSubjectReceipt, BoundSubjectReceipt, BoundSubjectReceipt]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ]
        | [
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
              BoundSubjectReceipt,
          ];
    requested_scope?: RequestedScope;
    time_context: TimeContext;
    options: InvestigationOptions;
    consumer: ConsumerInfo;
}

export type ACRContextFabricInvestigationResultV1 = {
    schema_version: "context_fabric_investigation_result.v1";
    result_id: string;
    request_id: string;
    generated_at: string;
    status: "complete" | "partial" | "degraded" | "clarification_required" | "no_match";
    question: string;
    interpretation: InterpretedQuestion;
    subject_resolution: SubjectResolution;
    cohort?: Cohort;
    direct_judgment: string;
    current_state: string;
    /**
     * @maxItems 50
     */
    strongest_pressures: string[];
    /**
     * @maxItems 50
     */
    drivers: DriverJudgment[];
    /**
     * @maxItems 250
     */
    remaining_work: Finding[];
    /**
     * @maxItems 250
     */
    readiness_gaps: Finding[];
    /**
     * @maxItems 250
     */
    paths: RelationshipPath[];
    /**
     * @maxItems 250
     */
    conflicts: Finding[];
    /**
     * @maxItems 100
     */
    limitations: string[];
    /**
     * @maxItems 500
     */
    evidence_ref_ids: string[];
    /**
     * @maxItems 250
     */
    claimed_facts: ClaimedFact[];
    coverage: Coverage;
    versions: VersionSet;
    deterministic_answer: string;
    /**
     * @maxItems 100
     */
    warnings: string[];
    /**
     * CHAOS-3782: true when this result was served from the immutable result store rather than a fresh investigation. When true, result_id and generated_at name the reused result's own identifier and generation time, not this request's.
     */
    reused: boolean;
};

export interface ContextFabricOrganizationModelConfigurationWriteRequestV1 {
    schema_version: "context_fabric_org_model_config_write_request.v1";
    provider: string;
    base_url?: string;
    model: string;
    fallback_model?: string;
    credential: string;
}

export interface ContextFabricOrganizationModelConfigurationV1 {
    schema_version: "context_fabric_org_model_config.v1";
    org_id: string;
    provider: string;
    base_url?: string;
    model: string;
    fallback_model?: string;
    credential_masked: string;
    created_at: string;
    updated_at: string;
}

export type ACRContextPacketItemV1 = {
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

export interface SelfCredentialRevocationRequestV1 {
    schema_version: "credential_revoke_request.v1";
    rollback_receipt?: {
        source_credential_id: string;
        replacement_credential_id: string;
        rollback_until: string;
    };
}

export interface SelfCredentialRevocationResponseV1 {
    schema_version: "credential_revoke_response.v1";
    credential: ACRClientCredentialMetadataV1;
}

export interface SelfCredentialRotationRequestV1 {
    schema_version: "credential_rotate_request.v1";
}

export interface SelfCredentialRotationResponseV1 {
    schema_version: "credential_rotate_response.v1";
    access_token: string;
    credential: ACRClientCredentialMetadataV1;
    receipt: {
        source_credential_id: string;
        replacement_credential_id: string;
        rollback_until: string;
    };
}

export interface DeviceApprovalPreviewRequestV1 {
    schema_version: "device_approval_preview_request.v1";
    user_code: string;
}

export interface DeviceApprovalPreviewResponseV1 {
    schema_version: "device_approval_preview_response.v1";
    organization_id_hint?: string;
    /**
     * @minItems 1
     * @maxItems 100
     */
    repository_hints?: [string, ...string[]];
}

export interface DeviceApprovalRequestV1 {
    schema_version: "device_approval_request.v1";
    user_code: string;
    repository_scopes: [string, ...string[]] | ["*"];
}

export interface DeviceApprovalResponseV1 {
    schema_version: "device_approval_response.v1";
    status: "approved";
}

export interface DeviceAuthorizationRequestV1 {
    schema_version: "device_authorization_request.v1";
    organization_id_hint?: string;
    /**
     * @minItems 1
     * @maxItems 100
     */
    repository_hints?: [string, ...string[]];
}

export interface DeviceAuthorizationResponseV1 {
    schema_version: "device_authorization_response.v1";
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: 600;
    interval: 5;
}

export interface DeviceTokenRequestV1 {
    schema_version: "device_token_request.v1";
    grant_type: "urn:ietf:params:oauth:grant-type:device_code";
    device_code: string;
}

export interface DeviceTokenResponseV1 {
    schema_version: "device_token_response.v1";
    access_token: string;
    token_type: "Bearer";
    expires_in: 2592000;
    credential: ACRClientCredentialMetadataV1;
}

export interface ACRErrorV1 {
    schema_version: "error.v1";
    request_id: string;
    error: {
        code:
            | "invalid_request"
            | "device_authorization_conflict"
            | "invalid_token"
            | "insufficient_scope"
            | "feature_not_enabled"
            | "repo_forbidden"
            | "not_found"
            | "rate_limited"
            | "version_mismatch"
            | "upstream_unavailable"
            | "upstream_invalid_output"
            | "interpretation_rejected"
            | "synthesis_rejected"
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

export interface OAuthDeviceGrantErrorV1 {
    schema_version: "oauth_device_error.v1";
    error:
        "authorization_pending" | "slow_down" | "access_denied" | "expired_token" | "invalid_grant";
}

export type ScalarValue = {
    string?: string;
    integer?: number;
    number?: number;
    boolean?: boolean;
    null?: true;
} & ScalarValue1;
export type ScalarValue1 = {
    [k: string]: unknown | undefined;
};
export type DriverJudgment = {
    driver_id: string;
    standing: "principal" | "contributing" | "symptom" | "context" | "withheld";
    category:
        | "status"
        | "actual_completion"
        | "work"
        | "blockers"
        | "reviews"
        | "continuous_integration"
        | "deployments"
        | "incidents"
        | "health"
        | "workload"
        | "investment"
        | "readiness"
        | "operational_deficiency"
        | "source_health"
        | "relationship"
        | "narrative";
    title: string;
    summary: string;
    /**
     * @minItems 1
     * @maxItems 250
     */
    affected_subjects: [SubjectRef, ...SubjectRef[]];
    /**
     * @maxItems 250
     */
    path_ids?: string[];
    /**
     * @maxItems 200
     */
    evidence_ref_ids: string[];
    /**
     * @maxItems 250
     */
    claimed_fact_ids?: string[];
    derivation:
        | "canonical_structured"
        | "deterministic_projection"
        | "graph_associated"
        | "model_extracted"
        | "rule_inferred";
    epistemic_status:
        "observed" | "source_asserted" | "inferred" | "disputed" | "superseded" | "unknown";
    confidence: number;
    qualification?: string;
    current: boolean;
};
export type InterpretedQuestion = {
    shape: "single_subject" | "explicit_cohort" | "discovered_cohort" | "open";
    requested_judgment: string;
    /**
     * @maxItems 50
     */
    subject_terms?: string[];
    /**
     * @maxItems 50
     */
    comparison_terms?: string[];
    time_context: TimeContext;
    /**
     * @maxItems 50
     */
    fact_requirements: FactRequirement[];
    clarification_needed: boolean;
    clarification_reason?: string;
};
export type TimeContext = {
    axis: "current" | "valid_time" | "observed_time" | "range";
    as_of?: string;
    start?: string;
    end?: string;
} & TimeContext1;
export type TimeContext1 =
    | {
          axis?: "current";
          [k: string]: unknown | undefined;
      }
    | {
          axis?: "valid_time" | "observed_time";
          [k: string]: unknown | undefined;
      }
    | {
          axis?: "range";
          [k: string]: unknown | undefined;
      };
export type SubjectHint = SubjectHint1 & {
    kind:
        | "organization"
        | "team"
        | "project"
        | "repository"
        | "work_item"
        | "pull_request"
        | "deployment"
        | "incident"
        | "document"
        | "decision"
        | "episode"
        | "metric"
        | "pull_request_review"
        | "ci_pipeline_run";
    id?: string;
    label?: string;
    source: string;
};
export type SubjectHint1 = {
    [k: string]: unknown | undefined;
};

export interface BoundSubjectReceipt {
    result_id: string;
    receipt_id: string;
}
export interface ClaimedFact {
    claim_id: string;
    kind:
        | "identity"
        | "membership"
        | "status"
        | "actual_completion"
        | "work"
        | "blockers"
        | "required_children"
        | "pull_requests"
        | "reviews"
        | "continuous_integration"
        | "deployments"
        | "incidents"
        | "metrics"
        | "health"
        | "workload"
        | "investment"
        | "readiness"
        | "operational_deficiencies"
        | "source_health"
        | "evidence";
    subject: SubjectRef;
    field: string;
    value: ScalarValue;
}
export interface SubjectRef {
    kind:
        | "organization"
        | "team"
        | "project"
        | "repository"
        | "work_item"
        | "pull_request"
        | "deployment"
        | "incident"
        | "document"
        | "decision"
        | "episode"
        | "metric"
        | "pull_request_review"
        | "ci_pipeline_run";
    canonical_id: string;
    label: string;
}
export interface Cohort {
    kind:
        | "organization"
        | "team"
        | "project"
        | "repository"
        | "work_item"
        | "pull_request"
        | "deployment"
        | "incident"
        | "document"
        | "decision"
        | "episode"
        | "metric"
        | "pull_request_review"
        | "ci_pipeline_run";
    /**
     * @maxItems 250
     */
    members: CohortMember[];
    /**
     * @maxItems 250
     */
    exclusions?: CohortExclusion[];
    rationale: string;
    complete: boolean;
    truncated: boolean;
}
export interface CohortMember {
    subject: SubjectRef;
    rank: number;
    /**
     * @minItems 1
     * @maxItems 32
     */
    inclusion_reasons: [string, ...string[]];
    /**
     * @maxItems 100
     */
    evidence_ref_ids?: string[];
}
export interface CohortExclusion {
    subject: SubjectRef;
    reason: string;
}
export interface ConsumerInfo {
    name: string;
    version: string;
    surface: string;
}
export interface ConversationTurn {
    turn_id: string;
    role: "user" | "assistant";
    content: string;
    created_at: string;
}
export interface Coverage {
    /**
     * @maxItems 100
     */
    sources: {
        source: string;
        state:
            | "available"
            | "stale"
            | "unavailable"
            | "unconfigured"
            | "unauthorized"
            | "no_data"
            | "truncated"
            | "conflicted"
            | "not_applicable";
        observed_at?: string;
        watermark?: string;
        reason?: string;
    }[];
    partial: boolean;
    /**
     * @maxItems 100
     */
    degraded_reasons?: string[];
}
export interface Finding {
    finding_id: string;
    kind: string;
    summary: string;
    /**
     * @maxItems 250
     */
    subjects?: SubjectRef[];
    /**
     * @minItems 1
     * @maxItems 200
     */
    evidence_ref_ids: [string, ...string[]];
    /**
     * @maxItems 250
     */
    claimed_fact_ids?: string[];
}
export interface FactRequirement {
    kind:
        | "identity"
        | "membership"
        | "status"
        | "actual_completion"
        | "work"
        | "blockers"
        | "required_children"
        | "pull_requests"
        | "reviews"
        | "continuous_integration"
        | "deployments"
        | "incidents"
        | "metrics"
        | "health"
        | "workload"
        | "investment"
        | "readiness"
        | "operational_deficiencies"
        | "source_health"
        | "evidence";
    /**
     * @maxItems 250
     */
    subjects?: SubjectRef[];
    parameters?: {
        [k: string]: string | undefined;
    };
}
export interface InvestigationOptions {
    max_subject_candidates: number;
    max_cohort_members: number;
    max_relationship_paths: number;
    max_drivers: number;
    max_evidence_refs: number;
    max_serialized_bytes: number;
    allow_clarification: boolean;
    include_debug: boolean;
}
export interface RelationshipPath {
    path_id: string;
    /**
     * @minItems 2
     * @maxItems 64
     */
    nodes: [SubjectRef, SubjectRef, ...SubjectRef[]];
    /**
     * @minItems 1
     * @maxItems 63
     */
    edges: [RelationshipEdge, ...RelationshipEdge[]];
    why_relevant: string;
    /**
     * @minItems 1
     * @maxItems 200
     */
    evidence_ref_ids: [string, ...string[]];
    truncated: boolean;
}
export interface RelationshipEdge {
    type:
        | "BELONGS_TO_REPOSITORY"
        | "BELONGS_TO_PULL_REQUEST"
        | "CORRELATED_WITH_INCIDENT"
        | "RELATED_TO"
        | "DOCUMENTED_BY"
        | "HAS_EPISODE"
        | "BLOCKS"
        | "PART_OF"
        | "RELATES_TO"
        | "DUPLICATES";
    from: SubjectRef;
    to: SubjectRef;
    derivation:
        | "canonical_structured"
        | "deterministic_projection"
        | "graph_associated"
        | "model_extracted"
        | "rule_inferred";
    epistemic_status:
        "observed" | "source_asserted" | "inferred" | "disputed" | "superseded" | "unknown";
    observed_at?: string;
    valid_from?: string;
    valid_to?: string;
    /**
     * @minItems 1
     * @maxItems 100
     */
    evidence_ref_ids: [string, ...string[]];
}
export interface RequestedScope {
    /**
     * @maxItems 200
     */
    repository_slugs?: string[];
    /**
     * @maxItems 200
     */
    project_ids?: string[];
    /**
     * @maxItems 200
     */
    team_ids?: string[];
    /**
     * @maxItems 50
     */
    subject_hints?: SubjectHint[];
}
export interface SubjectResolution {
    /**
     * @maxItems 50
     */
    candidates: SubjectCandidate[];
    /**
     * @maxItems 250
     */
    committed: SubjectRef[];
    clarification_prompt?: string;
}
export interface SubjectCandidate {
    receipt_id: string;
    subject: SubjectRef;
    state: "committed" | "proposed" | "ambiguous" | "unresolved";
    /**
     * @maxItems 32
     */
    matched_terms?: string[];
    /**
     * @minItems 1
     * @maxItems 32
     */
    match_reasons: [string, ...string[]];
    confidence: number;
    /**
     * @maxItems 100
     */
    evidence_ref_ids?: string[];
}
export interface VersionSet {
    service_version: string;
    contract_version: string;
    backend: string;
    backend_version?: string;
    projection_version: string;
    query_version: string;
    interpretation_version: string;
    synthesis_version: string;
    canonical_service_version: string;
    /**
     * CHAOS-3782: the provider/model that produced this result's synthesis, e.g. "openai-compatible/gpt-5-nano". Never a bare vendor name. Optional: rows persisted before this field existed (or by unknown writer with answer reuse disabled) omit it entirely; absence never blocks reading an existing result, and never makes that result reuse-eligible either (reuse also requires question_hash, absent on the same rows for the same reason). maxLength is provider (<=256) + "/" + model (<=256) = 513, not the 256 shared by every other field here -- those are short deployment/prompt version tokens ACR itself controls.
     */
    model_identity?: string;
}
