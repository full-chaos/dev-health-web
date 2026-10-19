export interface ACRClientCredentialMetadataV1 {
    schema_version: "acr_client_credential.v1";
    credential_id: string;
    name: string;
    token_prefix: string;
    org_id: string;
    repository_scopes: string[];
    /**
     * context:admin is retired: it is accepted here so a v1 credential that carried it stays valid, but it is never issued and no stored credential can carry it. Removal rides the next major version.
     *
     * @minItems 1
     */
    scopes: [
        "context:read" | "evidence:read" | "episode:write" | "context:admin" | "data:read",
        ...("context:read" | "evidence:read" | "episode:write" | "context:admin" | "data:read")[],
    ];
    created_at: string;
    expires_at: string | null;
    revoked_at: string | null;
    last_used_at: string | null;
    workload_binding_id?: string;
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
    enabled_tools: (
        | "context_for_task"
        | "source_evidence"
        | "investigate_question"
        | "investigate_with_interpretation"
        | "investigation_result"
        | "read_facts"
        | "record_episode"
        | "data_catalog"
        | "find_subjects"
        | "run_operation"
        | "graphql_query"
        | "read_relationships"
    )[];
    entitlements: {
        agent_context_runtime: boolean;
    };
    limits: {
        max_items: number;
        max_output_tokens: number;
        max_serialized_bytes: number;
        /**
         * The context request class's rate per minute. It does not describe the capabilities handshake's own budget (ACR_CAPABILITIES_REQUESTS_PER_WINDOW), the evidence, episode or data classes.
         */
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

export type ACRContextFabricInvestigationRequestV1 = {
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
    /**
     * CHAOS-3900 W1: winr_-namespaced receipts naming a prior result's own WindowClarification option. A NEW, parallel field to prior_subject_receipts, not an overload of it -- the match target and effect both differ.
     *
     * @maxItems 20
     */
    prior_window_receipts?:
        | []
        | [WindowBoundReceipt]
        | [WindowBoundReceipt, WindowBoundReceipt]
        | [WindowBoundReceipt, WindowBoundReceipt, WindowBoundReceipt]
        | [WindowBoundReceipt, WindowBoundReceipt, WindowBoundReceipt, WindowBoundReceipt]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ]
        | [
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
              WindowBoundReceipt,
          ];
    /**
     * CHAOS-3900 P1: kindr_-namespaced receipts naming a prior result's own StructureNeeds.kind_options entry. A NEW, parallel field, not an overload of prior_subject_receipts or prior_window_receipts -- the match target and effect both differ.
     *
     * @maxItems 20
     */
    prior_kind_receipts?:
        | []
        | [KindBoundReceipt]
        | [KindBoundReceipt, KindBoundReceipt]
        | [KindBoundReceipt, KindBoundReceipt, KindBoundReceipt]
        | [KindBoundReceipt, KindBoundReceipt, KindBoundReceipt, KindBoundReceipt]
        | [KindBoundReceipt, KindBoundReceipt, KindBoundReceipt, KindBoundReceipt, KindBoundReceipt]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ]
        | [
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
              KindBoundReceipt,
          ];
    /**
     * CHAOS-3900 P1: ancr_-namespaced receipts naming a prior result's own StructureNeeds.anchor_options entry.
     *
     * @maxItems 20
     */
    prior_anchor_receipts?:
        | []
        | [AnchorBoundReceipt]
        | [AnchorBoundReceipt, AnchorBoundReceipt]
        | [AnchorBoundReceipt, AnchorBoundReceipt, AnchorBoundReceipt]
        | [AnchorBoundReceipt, AnchorBoundReceipt, AnchorBoundReceipt, AnchorBoundReceipt]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ]
        | [
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
              AnchorBoundReceipt,
          ];
    /**
     * CHAOS-3900 P1: handr_-namespaced receipts naming a prior result's own StructureNeeds.handle_options entry.
     *
     * @maxItems 20
     */
    prior_handle_receipts?:
        | []
        | [HandleBoundReceipt]
        | [HandleBoundReceipt, HandleBoundReceipt]
        | [HandleBoundReceipt, HandleBoundReceipt, HandleBoundReceipt]
        | [HandleBoundReceipt, HandleBoundReceipt, HandleBoundReceipt, HandleBoundReceipt]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ]
        | [
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
              HandleBoundReceipt,
          ];
    /**
     * CHAOS-4012: candr_-namespaced receipts naming a prior result's own StructureNeeds.candidate_options entry.
     *
     * @maxItems 20
     */
    prior_candidate_receipts?:
        | []
        | [CandidateBoundReceipt]
        | [CandidateBoundReceipt, CandidateBoundReceipt]
        | [CandidateBoundReceipt, CandidateBoundReceipt, CandidateBoundReceipt]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ]
        | [
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
              CandidateBoundReceipt,
          ];
    /**
     * Result id of the investigation this turn follows. Optional. Seeds the same-conversation carry walk only; it never binds the named result's subjects into this turn. Bounded identically to prior_*_receipts[].result_id so the two can never disagree about what a well-formed result id is.
     */
    parent_result_id?: string;
    /**
     * CHAOS-3972 P3, design brief section 2.3/2.0/DP12(b): the caller's own explicit expected_kind guess(es). Per the DP12(b) uniform surface split, this NEVER mints question_stated authority by itself -- on the MCP surface it enters at inferred_default/explicit_unattributed (drives census-narrowing and offer-shaping only); every other surface keeps 3900 v5.2's ordinary question_stated rule.
     *
     * @maxItems 15
     *
     * Items: CHAOS-3900 P1: the closed ContextFabricSubjectKind vocabulary, given its own $def so KindOption/AnchorOption/HandleOption/AcceptedGrammar can $ref it directly rather than each re-duplicating the enum inline the way SubjectRef/SubjectCandidate/etc. still do at their own call sites.
     */
    expected_kinds?:
        | []
        | [
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
              | "ci_pipeline_run"
              | "work_item_ref",
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ]
        | [
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
              (
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
                  | "ci_pipeline_run"
                  | "work_item_ref"
              ),
          ];
    /**
     * CHAOS-3972 P3, design brief section 2.3: grammar-typed handle values the caller already knows. pattern_id must name one of the closed handle-grammar registry entries this deployment discloses via StructureNeeds.accepted_grammars -- never free text or a caller-supplied regex.
     *
     * @maxItems 20
     */
    subject_handles?:
        | []
        | [RequestedHandle]
        | [RequestedHandle, RequestedHandle]
        | [RequestedHandle, RequestedHandle, RequestedHandle]
        | [RequestedHandle, RequestedHandle, RequestedHandle, RequestedHandle]
        | [RequestedHandle, RequestedHandle, RequestedHandle, RequestedHandle, RequestedHandle]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ]
        | [
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
              RequestedHandle,
          ];
    /**
     * An interpretation the caller ran on its own model. When present the service runs no interpretation call: output is validated exactly as a model output is, and resolution, authorization, retrieval and answer assembly run unchanged. model_output_version, prompt_version and system_sha256 name the contract the caller ran. All three are required: a value that is absent or does not equal the service's own is refused with status 409 and the current values.
     */
    supplied_interpretation?: {
        /**
         * The model output object, at most 32768 bytes serialized.
         */
        output: {
            [k: string]: unknown | undefined;
        };
        model_output_version: string;
        prompt_version: string;
        system_sha256: string;
        client_model?: string;
    };
    /**
     * Who writes the answer. Absent or server: the service's own model writes it. client: the service runs everything but its synthesis call and returns, beside the stored result, the synthesis input for the caller's model to write the answer from. Without supplied_synthesis nothing the caller writes is sent back or stored.
     */
    synthesis_mode?: "server" | "client";
    /**
     * The answer draft the caller wrote on its own model from the synthesis input of an earlier answer to the same question. Requires synthesis_mode client and a supplied_interpretation. The service runs the turn again, checks that the rebuilt synthesis input is the one the draft was written from, validates the draft exactly as it validates its own model's draft, and makes no model call. An input that changed is refused with the new synthesis input.
     */
    supplied_synthesis?: {
        /**
         * The model output object of the synthesize_answer prompt, at most 262144 bytes serialized.
         */
        output: {
            [k: string]: unknown | undefined;
        };
        model_output_version: string;
        prompt_version: string;
        system_sha256: string;
        input_sha256: string;
        client_model?: string;
    };
    requested_scope?: RequestedScope;
    time_context: TimeContext;
    options: InvestigationOptions;
    consumer: ConsumerInfo;
};

/**
 * The create-investigation response body: the context_fabric_investigation_result.v1 fields plus an optional synthesis_input. Generated from the result schema: every property, required entry and rule of the result is carried unchanged.
 */
export type ACRContextFabricInvestigationResponseV1 = {
    schema_version: "context_fabric_investigation_result.v1";
    result_id: string;
    request_id: string;
    generated_at: string;
    status: "complete" | "partial" | "degraded" | "clarification_required" | "no_match";
    question: string;
    interpretation: InterpretedQuestion;
    subject_resolution: SubjectResolution;
    answer_plan?: AnswerPlan;
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
     * Model-authored limitations the engine dropped to fit a service-authored disclosure inside the limitations cap (CHAOS-3746; the disclosure may be retrieval degradation, a historical-axis statement, a commit retraction, or a clarification override). Absent or zero when nothing was displaced. It cannot be inferred from limitations itself: a displaced list and a list that had room are the same length and both end with the disclosure.
     */
    limitations_displaced?: number;
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
    temporal?: TemporalLabel;
    effective_evidence_window?: EffectiveEvidenceWindow;
    window_clarification?: WindowClarification;
    structure_needs?: StructureNeeds;
    /**
     * @maxItems 4
     */
    confirmed_structure?:
        | []
        | [ConfirmedStructureEntry]
        | [ConfirmedStructureEntry, ConfirmedStructureEntry]
        | [ConfirmedStructureEntry, ConfirmedStructureEntry, ConfirmedStructureEntry]
        | [
              ConfirmedStructureEntry,
              ConfirmedStructureEntry,
              ConfirmedStructureEntry,
              ConfirmedStructureEntry,
          ];
    /**
     * @maxItems 80
     */
    structure_offer_snapshot?: StructureOfferSnapshotEntry[];
    /**
     * CHAOS-4415: the OPTIONAL renderable shapes this answer warrants, chosen by deterministic rules from the interpreted intent and this result's own cohort and claimed facts. Absent on every answer no rule fired for.
     *
     * @maxItems 8
     */
    render_shapes?:
        | []
        | [RenderShape]
        | [RenderShape, RenderShape]
        | [RenderShape, RenderShape, RenderShape]
        | [RenderShape, RenderShape, RenderShape, RenderShape]
        | [RenderShape, RenderShape, RenderShape, RenderShape, RenderShape]
        | [RenderShape, RenderShape, RenderShape, RenderShape, RenderShape, RenderShape]
        | [
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
          ]
        | [
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
          ];
    completeness: AnswerCompleteness;
    /**
     * CHAOS-5405 D-d: one record per attempted requirement/origin scope decision. Optional-first: absent on every result written before this field existed, and on unknown path that resolved no scope at all -- absent and empty are different documents.
     *
     * @maxItems 27
     */
    fact_scope_census?: FactScopeCensusRecord[];
    /**
     * Count of scope decisions the census does not list because the request's serialized byte budget could not carry every row beside the smallest valid answer. Absent when every decision is listed. Additive: absent on every result written before this field existed.
     */
    fact_scope_census_omitted?: number;
    /**
     * CHAOS-4690: display label per evidence ref id reachable on this result; on a fresh write the key set equals the result's own evidence-ref closure exactly.
     */
    evidence_ref_labels?: {
        [k: string]: string | undefined;
    };
    /**
     * CHAOS-5442: names WHY the server refused to act on this question's frame, over a vocabulary. ABSENT on every turn that was not refused -- absence means "not refused", never "refused for a reason nobody recorded" (that state is the `unspecified` member). Orthogonal to terminal_reason, which names the CHANNEL an explanation travelled through rather than the decision taken: a refused frame carries both. `continuation_context_unverifiable` refuses a window-only continuation whose prior semantic context the server could not verify; it is not a frame refusal, and the document carries its own fixed limitation sentence. Open vocabulary; documented values: member_kind_unservable, frame_invariant_violated, unspecified, continuation_context_unverifiable, declared_kind_unmatched, organization_scope_unsupported, subject_identity_unconfirmed. A client must tolerate values it does not know.
     */
    refusal_basis?: string;
    /**
     * Present only when the server's outcome-derived completeness authority replaced the status the model authored: the status replaced (replaced_status), the pair served (direction), and the outcome row the derivation relied on (deciding_requirement, deciding_outcome; a requirement identity that also appears in completeness.outcomes). ABSENT means the served status is the model's own label, never 'unknown'. A status is never corrected up to complete.
     */
    status_correction?: {
        /**
         * The status the server replaced: the model's authored status unless an earlier server step (claim-depth trim, served-status floors) had already lowered it, which that step discloses through its own limitation.
         */
        replaced_status: "complete" | "partial" | "degraded";
        /**
         * model_status paired with the served status.
         */
        direction:
            | "complete_to_partial"
            | "complete_to_degraded"
            | "partial_to_degraded"
            | "degraded_to_partial";
        /**
         * Identity of the outcome row the derivation relied on; absent when no single row decided it.
         */
        deciding_requirement?: string;
        /**
         * That row's outcome.
         */
        deciding_outcome?:
            "satisfied" | "narrowed" | "unavailable" | "not_applicable" | "not_attempted";
    };
    /**
     * CHAOS-5672: present only on a read of a stored clarification whose answerability needed the stored accepted reading and could not load it. Absent means the read did not need the reading or had it. semantic_state_absent: the row carries no reading; semantic_state_unreadable: the row carries a reading this build cannot read. Fresh composition never sets it.
     */
    semantic_reading?: {
        status: "unavailable";
        /**
         * Open vocabulary; documented values: semantic_state_absent, semantic_state_unreadable. A client must tolerate values it does not know.
         */
        reason: string;
    };
    /**
     * The model input for the caller's model, served only in the turn that built it and never stored. Present only when the request asked synthesis_mode client and the turn reached synthesis. input_sha256 is the sha256 of the input bytes. The input names the evidence window the facts were read over in evidence_window (a relative window whose bounds the service resolved from its clock by relative_id and class only; a stated, confirmed or carried window with its bounds) and holds no time at which the turn looked: coverage.sources[].observed_at is left out; a time_context or evidence_window as_of, start or end is left out when the service pulled a future instant back to the time of its read; a fact's window_start and window_end are left out when its window_basis is default_trailing or the value is a bound the service resolved from its clock. So input_sha256 covers the facts, the coverage and the identity of the evidence window. A relative window, a clamped span and a provider's own default window are each one standing commitment: their moving bounds are not part of the digest, and a draft is accepted while the facts are unchanged. Apart from those times and the window it is what the service's own synthesis model is given; bounded is true when facts were reduced to fit the input size bound, and the input then holds fewer facts than the service's own model is given.
     */
    synthesis_input?: {
        contract: {
            model_output_version: string;
            prompt_version: string;
            system_sha256: string;
        };
        /**
         * The synthesis input object, at most 1048576 bytes serialized.
         */
        input: {
            [k: string]: unknown | undefined;
        };
        input_sha256: string;
        bounded: boolean;
        /**
         * @minItems 1
         * @maxItems 16
         */
        rules:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
              ]
            | [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
              ]
            | [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
              ]
            | [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
              ]
            | [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
              ]
            | [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
              ];
    };
};

/**
 * The create-investigation response body: the context_fabric_investigation_result.v2 fields plus an optional synthesis_input. Generated from the result schema: every property, required entry and rule of the result is carried unchanged.
 */
export type ACRContextFabricInvestigationResponseV2 = {
    schema_version: "context_fabric_investigation_result.v2";
    result_id: string;
    request_id: string;
    generated_at: string;
    status: "complete" | "partial" | "degraded" | "clarification_required" | "no_match";
    question: string;
    interpretation: InterpretedQuestion;
    subject_resolution: SubjectResolution;
    answer_plan?: AnswerPlan;
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
     * Model-authored limitations the engine dropped to fit a service-authored disclosure inside the limitations cap (CHAOS-3746; the disclosure may be retrieval degradation, a historical-axis statement, a commit retraction, or a clarification override). Absent or zero when nothing was displaced. It cannot be inferred from limitations itself: a displaced list and a list that had room are the same length and both end with the disclosure.
     */
    limitations_displaced?: number;
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
    temporal?: TemporalLabel;
    effective_evidence_window?: EffectiveEvidenceWindow;
    window_clarification?: WindowClarification;
    structure_needs?: StructureNeedsV2;
    /**
     * @maxItems 4
     */
    confirmed_structure?:
        | []
        | [ConfirmedStructureEntry]
        | [ConfirmedStructureEntry, ConfirmedStructureEntry]
        | [ConfirmedStructureEntry, ConfirmedStructureEntry, ConfirmedStructureEntry]
        | [
              ConfirmedStructureEntry,
              ConfirmedStructureEntry,
              ConfirmedStructureEntry,
              ConfirmedStructureEntry,
          ];
    /**
     * @maxItems 80
     */
    structure_offer_snapshot?: StructureOfferSnapshotEntry[];
    /**
     * CHAOS-4415: the OPTIONAL renderable shapes this answer warrants, chosen by deterministic rules from the interpreted intent and this result's own cohort and claimed facts. Absent on every answer no rule fired for.
     *
     * @maxItems 8
     */
    render_shapes?:
        | []
        | [RenderShape]
        | [RenderShape, RenderShape]
        | [RenderShape, RenderShape, RenderShape]
        | [RenderShape, RenderShape, RenderShape, RenderShape]
        | [RenderShape, RenderShape, RenderShape, RenderShape, RenderShape]
        | [RenderShape, RenderShape, RenderShape, RenderShape, RenderShape, RenderShape]
        | [
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
          ]
        | [
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
          ];
    completeness: AnswerCompleteness;
    /**
     * CHAOS-5405 D-d: one record per attempted requirement/origin scope decision. Optional-first: absent on every result written before this field existed, and on unknown path that resolved no scope at all -- absent and empty are different documents.
     *
     * @maxItems 27
     */
    fact_scope_census?: FactScopeCensusRecord[];
    /**
     * Count of scope decisions the census does not list because the request's serialized byte budget could not carry every row beside the smallest valid answer. Absent when every decision is listed. Additive: absent on every result written before this field existed.
     */
    fact_scope_census_omitted?: number;
    /**
     * CHAOS-4690: display label per evidence ref id reachable on this result; on a fresh write the key set equals the result's own evidence-ref closure exactly.
     */
    evidence_ref_labels?: {
        [k: string]: string | undefined;
    };
    /**
     * CHAOS-5442: names WHY the server refused to act on this question's frame, over a vocabulary. ABSENT on every turn that was not refused -- absence means "not refused", never "refused for a reason nobody recorded" (that state is the `unspecified` member). Orthogonal to terminal_reason, which names the CHANNEL an explanation travelled through rather than the decision taken: a refused frame carries both. `continuation_context_unverifiable` refuses a window-only continuation whose prior semantic context the server could not verify; it is not a frame refusal, and the document carries its own fixed limitation sentence. Open vocabulary; documented values: member_kind_unservable, frame_invariant_violated, unspecified, continuation_context_unverifiable, declared_kind_unmatched, organization_scope_unsupported, subject_identity_unconfirmed. A client must tolerate values it does not know.
     */
    refusal_basis?: string;
    /**
     * Present only when the server's outcome-derived completeness authority replaced the status the model authored: the status replaced (replaced_status), the pair served (direction), and the outcome row the derivation relied on (deciding_requirement, deciding_outcome; a requirement identity that also appears in completeness.outcomes). ABSENT means the served status is the model's own label, never 'unknown'. A status is never corrected up to complete.
     */
    status_correction?: {
        /**
         * The status the server replaced: the model's authored status unless an earlier server step (claim-depth trim, served-status floors) had already lowered it, which that step discloses through its own limitation.
         */
        replaced_status: "complete" | "partial" | "degraded";
        /**
         * model_status paired with the served status.
         */
        direction:
            | "complete_to_partial"
            | "complete_to_degraded"
            | "partial_to_degraded"
            | "degraded_to_partial";
        /**
         * Identity of the outcome row the derivation relied on; absent when no single row decided it.
         */
        deciding_requirement?: string;
        /**
         * That row's outcome.
         */
        deciding_outcome?:
            "satisfied" | "narrowed" | "unavailable" | "not_applicable" | "not_attempted";
    };
    /**
     * CHAOS-5672: present only on a read of a stored clarification whose answerability needed the stored accepted reading and could not load it. Absent means the read did not need the reading or had it. semantic_state_absent: the row carries no reading; semantic_state_unreadable: the row carries a reading this build cannot read. Fresh composition never sets it.
     */
    semantic_reading?: {
        status: "unavailable";
        /**
         * Open vocabulary; documented values: semantic_state_absent, semantic_state_unreadable. A client must tolerate values it does not know.
         */
        reason: string;
    };
    /**
     * The model input for the caller's model, served only in the turn that built it and never stored. Present only when the request asked synthesis_mode client and the turn reached synthesis. input_sha256 is the sha256 of the input bytes. The input names the evidence window the facts were read over in evidence_window (a relative window whose bounds the service resolved from its clock by relative_id and class only; a stated, confirmed or carried window with its bounds) and holds no time at which the turn looked: coverage.sources[].observed_at is left out; a time_context or evidence_window as_of, start or end is left out when the service pulled a future instant back to the time of its read; a fact's window_start and window_end are left out when its window_basis is default_trailing or the value is a bound the service resolved from its clock. So input_sha256 covers the facts, the coverage and the identity of the evidence window. A relative window, a clamped span and a provider's own default window are each one standing commitment: their moving bounds are not part of the digest, and a draft is accepted while the facts are unchanged. Apart from those times and the window it is what the service's own synthesis model is given; bounded is true when facts were reduced to fit the input size bound, and the input then holds fewer facts than the service's own model is given.
     */
    synthesis_input?: {
        contract: {
            model_output_version: string;
            prompt_version: string;
            system_sha256: string;
        };
        /**
         * The synthesis input object, at most 1048576 bytes serialized.
         */
        input: {
            [k: string]: unknown | undefined;
        };
        input_sha256: string;
        bounded: boolean;
        /**
         * @minItems 1
         * @maxItems 16
         */
        rules:
            | [string]
            | [string, string]
            | [string, string, string]
            | [string, string, string, string]
            | [string, string, string, string, string]
            | [string, string, string, string, string, string]
            | [string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string]
            | [string, string, string, string, string, string, string, string, string, string]
            | [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
              ]
            | [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
              ]
            | [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
              ]
            | [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
              ]
            | [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
              ]
            | [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
              ];
    };
};

export type ACRContextFabricInvestigationResultV1 = {
    schema_version: "context_fabric_investigation_result.v1";
    result_id: string;
    request_id: string;
    generated_at: string;
    status: "complete" | "partial" | "degraded" | "clarification_required" | "no_match";
    question: string;
    interpretation: InterpretedQuestion;
    subject_resolution: SubjectResolution;
    answer_plan?: AnswerPlan;
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
     * Model-authored limitations the engine dropped to fit a service-authored disclosure inside the limitations cap (CHAOS-3746; the disclosure may be retrieval degradation, a historical-axis statement, a commit retraction, or a clarification override). Absent or zero when nothing was displaced. It cannot be inferred from limitations itself: a displaced list and a list that had room are the same length and both end with the disclosure.
     */
    limitations_displaced?: number;
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
    temporal?: TemporalLabel;
    effective_evidence_window?: EffectiveEvidenceWindow;
    window_clarification?: WindowClarification;
    structure_needs?: StructureNeeds;
    /**
     * @maxItems 4
     */
    confirmed_structure?:
        | []
        | [ConfirmedStructureEntry]
        | [ConfirmedStructureEntry, ConfirmedStructureEntry]
        | [ConfirmedStructureEntry, ConfirmedStructureEntry, ConfirmedStructureEntry]
        | [
              ConfirmedStructureEntry,
              ConfirmedStructureEntry,
              ConfirmedStructureEntry,
              ConfirmedStructureEntry,
          ];
    /**
     * @maxItems 80
     */
    structure_offer_snapshot?: StructureOfferSnapshotEntry[];
    /**
     * CHAOS-4415: the OPTIONAL renderable shapes this answer warrants, chosen by deterministic rules from the interpreted intent and this result's own cohort and claimed facts. Absent on every answer no rule fired for.
     *
     * @maxItems 8
     */
    render_shapes?:
        | []
        | [RenderShape]
        | [RenderShape, RenderShape]
        | [RenderShape, RenderShape, RenderShape]
        | [RenderShape, RenderShape, RenderShape, RenderShape]
        | [RenderShape, RenderShape, RenderShape, RenderShape, RenderShape]
        | [RenderShape, RenderShape, RenderShape, RenderShape, RenderShape, RenderShape]
        | [
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
          ]
        | [
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
              RenderShape,
          ];
    completeness: AnswerCompleteness;
    /**
     * CHAOS-5405 D-d: one record per attempted requirement/origin scope decision. Optional-first: absent on every result written before this field existed, and on unknown path that resolved no scope at all -- absent and empty are different documents.
     *
     * @maxItems 27
     */
    fact_scope_census?: FactScopeCensusRecord[];
    /**
     * Count of scope decisions the census does not list because the request's serialized byte budget could not carry every row beside the smallest valid answer. Absent when every decision is listed. Additive: absent on every result written before this field existed.
     */
    fact_scope_census_omitted?: number;
    /**
     * CHAOS-4690: display label per evidence ref id reachable on this result; on a fresh write the key set equals the result's own evidence-ref closure exactly.
     */
    evidence_ref_labels?: {
        [k: string]: string | undefined;
    };
    /**
     * CHAOS-5442: names WHY the server refused to act on this question's frame, over a vocabulary. ABSENT on every turn that was not refused -- absence means "not refused", never "refused for a reason nobody recorded" (that state is the `unspecified` member). Orthogonal to terminal_reason, which names the CHANNEL an explanation travelled through rather than the decision taken: a refused frame carries both. `continuation_context_unverifiable` refuses a window-only continuation whose prior semantic context the server could not verify; it is not a frame refusal, and the document carries its own fixed limitation sentence. Open vocabulary; documented values: member_kind_unservable, frame_invariant_violated, unspecified, continuation_context_unverifiable, declared_kind_unmatched, organization_scope_unsupported, subject_identity_unconfirmed. A client must tolerate values it does not know.
     */
    refusal_basis?: string;
    /**
     * Present only when the server's outcome-derived completeness authority replaced the status the model authored: the status replaced (replaced_status), the pair served (direction), and the outcome row the derivation relied on (deciding_requirement, deciding_outcome; a requirement identity that also appears in completeness.outcomes). ABSENT means the served status is the model's own label, never 'unknown'. A status is never corrected up to complete.
     */
    status_correction?: {
        /**
         * The status the server replaced: the model's authored status unless an earlier server step (claim-depth trim, served-status floors) had already lowered it, which that step discloses through its own limitation.
         */
        replaced_status: "complete" | "partial" | "degraded";
        /**
         * model_status paired with the served status.
         */
        direction:
            | "complete_to_partial"
            | "complete_to_degraded"
            | "partial_to_degraded"
            | "degraded_to_partial";
        /**
         * Identity of the outcome row the derivation relied on; absent when no single row decided it.
         */
        deciding_requirement?: string;
        /**
         * That row's outcome.
         */
        deciding_outcome?:
            "satisfied" | "narrowed" | "unavailable" | "not_applicable" | "not_attempted";
    };
    /**
     * CHAOS-5672: present only on a read of a stored clarification whose answerability needed the stored accepted reading and could not load it. Absent means the read did not need the reading or had it. semantic_state_absent: the row carries no reading; semantic_state_unreadable: the row carries a reading this build cannot read. Fresh composition never sets it.
     */
    semantic_reading?: {
        status: "unavailable";
        /**
         * Open vocabulary; documented values: semantic_state_absent, semantic_state_unreadable. A client must tolerate values it does not know.
         */
        reason: string;
    };
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
    /**
     * Open vocabulary; documented values: state, pressure, cause, evidence, action. A client must tolerate values it does not know.
     */
    category: string;
    /**
     * Open vocabulary; documented values: observed, inferred, recommendation. A client must tolerate values it does not know.
     */
    claim_kind: string;
    title: string;
    summary: string;
    why_included: string;
    rule_id: string;
    confidence: number;
    /**
     * Open vocabulary; documented values: info, warning, high, critical. A client must tolerate values it does not know.
     */
    severity: string;
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
    cause_event?: {
        entity_type: "deployment";
        entity_id: string;
        occurred_at: string;
    };
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
        /**
         * Open vocabulary; documented values: exact_commit, branch_filtered, repo_fallback, unresolved. A client must tolerate values it does not know.
         */
        resolution: string;
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
            /**
             * Newest stored sync time of this source's rows in the repository (last_synced; work items also ingested_at). For repository_freshness it is the repository row's last_synced, rewritten on every repository sync run. For every other source it is a row WRITE time: a sync that finds nothing new rewrites nothing, so a quiet repository can show an old time here although it synced. It is never an event time (a commit, deploy or work item change). Omitted when the source stores no sync time (status unknown) or holds no rows.
             */
            last_ingested_at?: string;
            /**
             * Newest observed_at of this source's rows in scope. Where the source has an event time (commit, review, CI run, deploy, work item update) it is that event time and says how recent the activity is, never how recently the source was synced. Where the source has none (pull requests, commit files, dependencies, the repository row) observed_at is the row's own sync time. No status is judged from it.
             */
            last_event_at?: string;
            /**
             * Open vocabulary; documented values: fresh, stale, missing, unavailable, unknown. fresh = last_ingested_at is within stale_after_seconds before as_of. stale is served only for repository_freshness, whose last_ingested_at is a sync run stamp, when older than stale_after_seconds. unknown = rows exist but freshness cannot be judged: the source stores no sync time, only an old row write time (a quiet repository looks the same), or the time could not be read; never stale. A client must tolerate values it does not know.
             */
            status: string;
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

export interface SelfCredentialAcknowledgementRequestV1 {
    schema_version: "credential_ack_request.v1";
    credential_id?: string;
}

export interface SelfCredentialAcknowledgementResponseV1 {
    schema_version: "credential_ack_response.v1";
    credential_id: string;
    acknowledged_at: string;
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
    /**
     * The scopes the device grant asked for, in canonical order. The default pair (context:read, evidence:read) when the grant named none or the device authorization has no OAuth grant (legacy acr-mcp login).
     *
     * @minItems 1
     * @maxItems 3
     */
    requested_scopes?:
        | ["context:read" | "evidence:read" | "data:read"]
        | [
              "context:read" | "evidence:read" | "data:read",
              "context:read" | "evidence:read" | "data:read",
          ]
        | [
              "context:read" | "evidence:read" | "data:read",
              "context:read" | "evidence:read" | "data:read",
              "context:read" | "evidence:read" | "data:read",
          ];
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
            | "budget_refusal"
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
            | "store_unavailable"
            | "interpretation_rejected"
            | "synthesis_rejected"
            | "internal_error";
        message: string;
        http_status: number;
        retryable: boolean;
        /**
         * Closed safe keys only. For a 400 invalid_request about the request body, details.reason is malformed_json, schema_violation, unknown_field, trailing_json or body_too_large, and details.field, when present, is the JSON path of the failing field. A budget_refusal is a 413 for a valid request whose answer did not fit the response budget; details carry the closed budget keys that route measured (overrun, measured_items, measured_bytes, max_items, max_serialized_bytes, retry_attempted, narrower_continuation); every key is optional and a route sends only the ones it measured.
         */
        details?: {
            reason?: string;
            field?: string;
            /**
             * On a 429 rate_limited: which limit refused the request. request_budget is the organization's request budget; capabilities_budget is the capabilities handshake's own budget, spent by the caller-resolution call every MCP request makes; the credential was already decided in both cases. A consumer treats a value outside this enum as absent.
             */
            limit?: "request_budget" | "capabilities_budget";
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
    /**
     * Open vocabulary; documented values: native, explicit_text, heuristic, derived. A client must tolerate values it does not know.
     */
    provenance: string;
    confidence: number;
    citation: string;
    observed_at: string;
    event_at?: string;
    source_version?: string;
    snapshot_hash?: string;
    content_digest?: string;
    /**
     * Open vocabulary; documented values: available, stale, redacted, deleted, unauthorized. A client must tolerate values it does not know.
     */
    availability: string;
    metadata?: {
        [k: string]: unknown | undefined;
    };
}

export interface ACRExpandedEvidenceV1 {
    schema_version: "expanded_evidence.v1";
    evidence: ACREvidenceReferenceV1;
    resolved_at: string;
    /**
     * Open vocabulary; documented values: available, stale, redacted, deleted, unauthorized. A client must tolerate values it does not know.
     */
    availability: string;
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

/**
 * CHAOS-4413: promotes the answer-rate/terminal-state measurement (formerly harness-only telemetry, CHAOS-4386) into the public contract. terminal_status/terminal_reason answer WHY the answer stopped where it did; claimed_facts_count/rows_count answer HOW MUCH of an answer is here -- the un-clamped totals, independent of unknown bounded consumer's own projection budget.
 */
export type AnswerCompleteness = {
    terminal_status: "complete" | "partial" | "degraded" | "clarification_required" | "no_match";
    /**
     * Absent (or empty) exactly when terminal_status is complete -- there is nothing to disclose. Present and one of these values on every other status; never the engine's or a model's own raw text. Open vocabulary; documented values: clarification_reason_disclosed, degraded_reason_disclosed, limitation_disclosed, warning_disclosed, undisclosed. A client must tolerate values it does not know.
     */
    terminal_reason?: string;
    claimed_facts_count: number;
    rows_count: number;
    /**
     * What the outcome set below adds up to, DERIVED from it and never authored independently: complete when every row is satisfied or not_applicable, partial when unknown row is narrowed or not_attempted and none is unavailable, degraded when unknown row is unavailable, and not_derived when there are no rows at all. not_derived is a real state, not a gap -- an empty set would otherwise derive complete vacuously, letting an answer whose outcomes were never derived claim the strongest completeness there is.
     */
    state: "not_derived" | "complete" | "partial" | "degraded";
    /**
     * The ONE authority for what this answer was supposed to contain and what became of it. Every narrowing stage between planning and the served document APPENDS to it; no stage rewrites or removes another stage's row, and state above is derived from the whole set at the surface that serves the answer. That ordering is what makes it impossible to measure completeness and then shrink the document somewhere the measurement cannot see. Rows are in stage order and a later stage supersedes an earlier one: the effective account of a requirement is its last row.
     *
     * @maxItems 200
     */
    outcomes?: PlanRequirementOutcomeRow[];
    /**
     * CHAOS-5442: names WHY the server refused to act on this question's frame, over a vocabulary. ABSENT on every turn that was not refused -- absence means "not refused", never "refused for a reason nobody recorded" (that state is the `unspecified` member). Orthogonal to terminal_reason, which names the CHANNEL an explanation travelled through rather than the decision taken: a refused frame carries both. `continuation_context_unverifiable` refuses a window-only continuation whose prior semantic context the server could not verify; it is not a frame refusal, and the document carries its own fixed limitation sentence. Open vocabulary; documented values: member_kind_unservable, frame_invariant_violated, unspecified, continuation_context_unverifiable, declared_kind_unmatched, organization_scope_unsupported, subject_identity_unconfirmed. A client must tolerate values it does not know.
     */
    refusal_basis?: string;
    /**
     * Present only when the server's outcome-derived completeness authority replaced the status the model authored: the status replaced (replaced_status), the pair served (direction), and the outcome row the derivation relied on (deciding_requirement, deciding_outcome; a requirement identity that also appears in completeness.outcomes). ABSENT means the served status is the model's own label, never 'unknown'. A status is never corrected up to complete.
     */
    status_correction?: {
        /**
         * The status the server replaced: the model's authored status unless an earlier server step (claim-depth trim, served-status floors) had already lowered it, which that step discloses through its own limitation.
         */
        replaced_status: "complete" | "partial" | "degraded";
        /**
         * model_status paired with the served status.
         */
        direction:
            | "complete_to_partial"
            | "complete_to_degraded"
            | "partial_to_degraded"
            | "degraded_to_partial";
        /**
         * Identity of the outcome row the derivation relied on; absent when no single row decided it.
         */
        deciding_requirement?: string;
        /**
         * That row's outcome.
         */
        deciding_outcome?:
            "satisfied" | "narrowed" | "unavailable" | "not_applicable" | "not_attempted";
    };
};
/**
 * CHAOS-4636 (promoted from CHAOS-4632's shadow vocabulary once its false-emission rate was measured on real data). The question-family vocabulary. It does not replace InvestigationShape. Open vocabulary; documented values: subject_investigation, discovered_cohort_ranking, scoped_cohort_status, grouped_cohort_status, explicit_comparison, trend, investment_allocation, unclassified. A client must tolerate values it does not know.
 */
export type QuestionFamily = string;
/**
 * How a family was reached. On the wire beside the family because "the model said so at N=1" and "carried from the previous turn" are different warrants for the same value. Open vocabulary; documented values: model_consensus, model, model_plurality_rejected, carried, structure_precedence, fallback, none. A client must tolerate values it does not know.
 */
export type QuestionFamilySource = string;
/**
 * CHAOS-3900 P1: the closed ContextFabricSubjectKind vocabulary, given its own $def so KindOption/AnchorOption/HandleOption/AcceptedGrammar can $ref it directly rather than each re-duplicating the enum inline the way SubjectRef/SubjectCandidate/etc. still do at their own call sites.
 */
export type SubjectKind =
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
    | "ci_pipeline_run"
    | "work_item_ref";
/**
 * CHAOS-4415: the CLOSED vocabulary of renderable answer shapes. Every member is defined now so a consumer can switch exhaustively; only "series" has a producer in slice 1.
 */
export type RenderKind =
    "series" | "table" | "quadrant" | "treemap" | "sunburst" | "sankey" | "burndown" | "forecast";
/**
 * CHAOS-3900 P1: the closed enum for which intent-frame member is missing or ambiguous (pivot-intent design brief section 2.1).
 */
export type StructureNeedKind =
    "expected_kind" | "subject_anchor" | "subject_handle" | "window" | "subject_candidate";
/**
 * The declared order a narrowing step takes members in. canonical_id_lexical is ARBITRARY and says so -- what a pre-read guard needs is stability, not relevance. attention_rank exists only after the fact read. overlap_aware_set_cover (CHAOS-4678) is an exact minimum set cover over a grouped narrowing's groups, used up to a small group-count guard; beyond it a grouped narrowing falls back to largest_group_round_robin and reports that basis instead. link_strength_then_id orders a repository's work-item walk by the strength of each issue's link (native, then stated in text, then heuristic) and then by canonical id.
 */
export type NarrowingBasis =
    | "canonical_id_lexical"
    | "largest_group_round_robin"
    | "attention_rank"
    | "overlap_aware_set_cover"
    | "link_strength_then_id";
/**
 * The three moments a plan may narrow. Three, because the budgets become knowable at three different times: cardinality is all that is knowable pre-read; synthesis CREATES the drivers/findings/claims the item budget charges, so pre-synthesis can only bound its INPUTS; and only the assembled result can be measured.
 */
export type PlanNarrowingStage = "cardinality" | "synthesis_input" | "assembled_result";
/**
 * Which budget axis an assembled answer exceeded.
 */
export type BudgetOverrun = "fits" | "items" | "bytes";
export type ClaimedFact = {
    claim_id: string;
    /**
     * Open vocabulary; documented values: identity, membership, status, actual_completion, work, blockers, required_children, pull_requests, reviews, continuous_integration, deployments, incidents, metrics, health, workload, investment, readiness, operational_deficiencies, source_health, evidence, flow, landscape, security_alerts, commitment, file_hotspots, cardinality. A client must tolerate values it does not know.
     */
    kind: string;
    subject: SubjectRef;
    field: string;
    value: ScalarValue;
    fact_id?: string;
    /**
     * Additive: the served facts a derived value is computed from, in order. Set together with operation; excludes fact_id. sum takes two or more inputs, difference and ratio exactly two.
     *
     * @minItems 2
     * @maxItems 8
     */
    derived_from?:
        | [
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
          ]
        | [
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
          ]
        | [
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
          ]
        | [
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
          ]
        | [
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
          ]
        | [
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
          ]
        | [
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
              {
                  fact_id: string;
                  field: string;
              },
          ];
    operation?: "sum" | "difference" | "ratio";
    /**
     * CHAOS-4347, additive: a renderable table for a fact whose evidence is genuinely a set of rows (e.g. a project's per-team metrics rollup) rather than one scalar. Optional; a claim carries `field`/`value` as its primary scalar either way.
     *
     * @maxItems 64
     */
    rows?: ClaimedFactRow[];
    table?: ClaimedFactTable;
    /**
     * CHAOS-4682 (§5.1 P2 dual-read cutover), additive and OPTIONAL: the CHAOS-4645 time_series rows riding ALONGSIDE the legacy field `rows` already serves, present only on a dual-table fact (a legacy table AND a time_series table at once). `rows`/`table` above keep their CURRENT meaning and preference unconditionally -- this never changes what they carry. Nil on a single-table fact, whose one table is already served by `rows`.
     *
     * @maxItems 64
     */
    time_series_rows?: ClaimedFactRow[];
    time_series_table?: ClaimedFactTable1;
};
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
export type Cohort = {
    /**
     * Open vocabulary; documented values: organization, team, project, repository, work_item, pull_request, deployment, incident, document, decision, episode, metric, pull_request_review, ci_pipeline_run, work_item_ref. A client must tolerate values it does not know.
     */
    kind: string;
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
    /**
     * CHAOS-4636: absent on every flat cohort. When present, the cohort-level complete/truncated above are AT LEAST AS CONSERVATIVE as the conjunction/disjunction over these groups (complete=true requires every group complete; unknown group truncated requires the cohort truncated), so a reader that ignores groups gets a conservative summary of the whole union rather than a boolean describing only the first group. CHAOS-4733: the cohort-level pair can be MORE conservative than the groups alone show -- complete=false, or truncated=true, while every group individually looks complete -- because a discovery-level cap on the whole cohort (before unknown group existed) is not a fact unknown one group's own total-vs-presented count can carry.
     *
     * @maxItems 250
     */
    groups?: CohortGroup[];
    /**
     * CHAOS-5774: the closed-vocabulary statement of what member score/attention_rank/ranking_basis/drivers actually measure. Present iff at least one member has ranking_computed=true.
     */
    score_meaning?: "attention";
    /**
     * server-computed, true when the investigation's requested judgment asked for a comparison score_meaning does not support. Never set without score_meaning also present.
     */
    judgment_mismatch?: boolean;
    /**
     * how many members the caller may read, counted before the answer item limit cut the list. Present on a work-item cohort when the read measured it; members never exceed it.
     */
    population?: number;
    /**
     * true when population counts what was read and the real population can be larger.
     */
    population_lower_bound?: boolean;
};
export type CohortMember = {
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
    ranking_computed?: boolean;
    attention_rank?: number;
    score?: number;
    /**
     * @maxItems 16
     */
    ranking_basis?:
        | []
        | [
              | "investment_mix"
              | "health.compounding_risk"
              | "operational_deficiencies.severity"
              | "readiness.coverage_gap"
              | "workload.forecast_pressure"
              | "investment_mix.reactive_share_high"
              | "investment_mix.deliberate_share_low"
              | "investment_mix.mix_concentrated"
              | "investment_mix.mix_shift_toward_operational"
              | "investment_mix.mix_shift_toward_feature"
              | "investment_mix.mix_shift_other",
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ];
    data_completeness?: "complete" | "partial" | "degraded";
    /**
     * @maxItems 5
     */
    drivers?:
        | []
        | [CohortMemberDriver]
        | [CohortMemberDriver, CohortMemberDriver]
        | [CohortMemberDriver, CohortMemberDriver, CohortMemberDriver]
        | [CohortMemberDriver, CohortMemberDriver, CohortMemberDriver, CohortMemberDriver]
        | [
              CohortMemberDriver,
              CohortMemberDriver,
              CohortMemberDriver,
              CohortMemberDriver,
              CohortMemberDriver,
          ];
    outcome?: "qualified" | "provisional" | "insufficient_evidence" | "not_applicable";
    /**
     * @minItems 1
     * @maxItems 5
     */
    missing_signals?:
        | [
              | "investment_mix"
              | "health.compounding_risk"
              | "operational_deficiencies.severity"
              | "readiness.coverage_gap"
              | "workload.forecast_pressure",
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
          ]
        | [
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
              (
                  | "investment_mix"
                  | "health.compounding_risk"
                  | "operational_deficiencies.severity"
                  | "readiness.coverage_gap"
                  | "workload.forecast_pressure"
              ),
          ];
};
export type CohortMemberDriver = {
    signal:
        | "investment_mix"
        | "health.compounding_risk"
        | "operational_deficiencies.severity"
        | "readiness.coverage_gap"
        | "workload.forecast_pressure";
    value: number;
    weight: number;
    weight_contributed: number;
    window: "current" | "current_vs_prior";
    /**
     * @maxItems 4
     */
    threshold_labels?:
        | []
        | [
              | "investment_mix.reactive_share_high"
              | "investment_mix.deliberate_share_low"
              | "investment_mix.mix_concentrated"
              | "investment_mix.mix_shift_toward_operational"
              | "investment_mix.mix_shift_toward_feature"
              | "investment_mix.mix_shift_other",
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ];
    concentration?: number;
    concentration_method?: "max_share";
    /**
     * @maxItems 250
     */
    source_claimed_fact_ids?: string[];
} & {
    signal:
        | "investment_mix"
        | "health.compounding_risk"
        | "operational_deficiencies.severity"
        | "readiness.coverage_gap"
        | "workload.forecast_pressure";
    value: number;
    weight: number;
    weight_contributed: number;
    window: "current" | "current_vs_prior";
    /**
     * @maxItems 4
     */
    threshold_labels?:
        | []
        | [
              | "investment_mix.reactive_share_high"
              | "investment_mix.deliberate_share_low"
              | "investment_mix.mix_concentrated"
              | "investment_mix.mix_shift_toward_operational"
              | "investment_mix.mix_shift_toward_feature"
              | "investment_mix.mix_shift_other",
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ];
    concentration?: number;
    concentration_method?: "max_share";
    /**
     * @maxItems 250
     */
    source_claimed_fact_ids?: string[];
} & {
    signal:
        | "investment_mix"
        | "health.compounding_risk"
        | "operational_deficiencies.severity"
        | "readiness.coverage_gap"
        | "workload.forecast_pressure";
    value: number;
    weight: number;
    weight_contributed: number;
    window: "current" | "current_vs_prior";
    /**
     * @maxItems 4
     */
    threshold_labels?:
        | []
        | [
              | "investment_mix.reactive_share_high"
              | "investment_mix.deliberate_share_low"
              | "investment_mix.mix_concentrated"
              | "investment_mix.mix_shift_toward_operational"
              | "investment_mix.mix_shift_toward_feature"
              | "investment_mix.mix_shift_other",
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ];
    concentration?: number;
    concentration_method?: "max_share";
    /**
     * @maxItems 250
     */
    source_claimed_fact_ids?: string[];
} & {
    signal:
        | "investment_mix"
        | "health.compounding_risk"
        | "operational_deficiencies.severity"
        | "readiness.coverage_gap"
        | "workload.forecast_pressure";
    value: number;
    weight: number;
    weight_contributed: number;
    window: "current" | "current_vs_prior";
    /**
     * @maxItems 4
     */
    threshold_labels?:
        | []
        | [
              | "investment_mix.reactive_share_high"
              | "investment_mix.deliberate_share_low"
              | "investment_mix.mix_concentrated"
              | "investment_mix.mix_shift_toward_operational"
              | "investment_mix.mix_shift_toward_feature"
              | "investment_mix.mix_shift_other",
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ];
    concentration?: number;
    concentration_method?: "max_share";
    /**
     * @maxItems 250
     */
    source_claimed_fact_ids?: string[];
} & {
    signal:
        | "investment_mix"
        | "health.compounding_risk"
        | "operational_deficiencies.severity"
        | "readiness.coverage_gap"
        | "workload.forecast_pressure";
    value: number;
    weight: number;
    weight_contributed: number;
    window: "current" | "current_vs_prior";
    /**
     * @maxItems 4
     */
    threshold_labels?:
        | []
        | [
              | "investment_mix.reactive_share_high"
              | "investment_mix.deliberate_share_low"
              | "investment_mix.mix_concentrated"
              | "investment_mix.mix_shift_toward_operational"
              | "investment_mix.mix_shift_toward_feature"
              | "investment_mix.mix_shift_other",
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ]
        | [
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
              (
                  | "investment_mix.reactive_share_high"
                  | "investment_mix.deliberate_share_low"
                  | "investment_mix.mix_concentrated"
                  | "investment_mix.mix_shift_toward_operational"
                  | "investment_mix.mix_shift_toward_feature"
                  | "investment_mix.mix_shift_other"
              ),
          ];
    concentration?: number;
    concentration_method?: "max_share";
    /**
     * @maxItems 250
     */
    source_claimed_fact_ids?: string[];
};
/**
 * CHAOS-3900 P1: vocabulary for how a ConfirmedStructureEntry's value entered (design brief section 2.1's echo). Open vocabulary; documented values: receipt, explicit, explicit_unattributed, carried. A client must tolerate values it does not know.
 */
export type StructureSource = string;
/**
 * CHAOS-3900 P1: vocabulary distinguishing an engine-derived offer from a Bridge-proposed one (design brief section 2.1/2.4). Open vocabulary; documented values: engine, prior. A client must tolerate values it does not know.
 */
export type StructureOfferSource = string;
/**
 * CHAOS-3900 P1: authority-tier vocabulary for a ConfirmedStructureEntry (design brief section 2.0's authority table). A distinct enum from WindowProvenance despite sharing the same three values -- each frame member owns its own authority vocabulary independently. engine_committed (v1-additive) is a carried subject_anchor member the engine bound to the frame's own anchor with no clarification ever offered. Open vocabulary; documented values: inferred_default, question_stated, clarification_confirmed, engine_committed. A client must tolerate values it does not know.
 */
export type StructureProvenance = string;
/**
 * CHAOS-3900 P1: closed vocabulary for what happened to one carried structure member (design brief section 2.1's silent-drop closure).
 */
export type StructureDisposition =
    | "applied"
    | "vetoed_unresolved"
    | "vetoed_conflict"
    | "vetoed_stale"
    | "superseded_by_caller"
    | "not_evaluated";
export type DriverJudgment = {
    driver_id: string;
    /**
     * Open vocabulary; documented values: principal, contributing, symptom, context, withheld. A client must tolerate values it does not know.
     */
    standing: string;
    /**
     * Open vocabulary; documented values: status, actual_completion, work, blockers, reviews, continuous_integration, deployments, incidents, health, workload, investment, readiness, operational_deficiency, source_health, relationship, narrative. A client must tolerate values it does not know.
     */
    category: string;
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
    /**
     * Open vocabulary; documented values: canonical_structured, deterministic_projection, graph_associated, model_extracted, rule_inferred. A client must tolerate values it does not know.
     */
    derivation: string;
    /**
     * Open vocabulary; documented values: observed, source_asserted, inferred, disputed, superseded, unknown. A client must tolerate values it does not know.
     */
    epistemic_status: string;
    confidence: number;
    qualification?: string;
    rank?: number;
    /**
     * Open vocabulary; documented values: available, stale, unavailable, unconfigured, unauthorized, no_data, truncated, conflicted, not_applicable, pruned. A client must tolerate values it does not know.
     */
    source_state?: string;
    source_state_note?: string;
    summary_corrected?: boolean;
    current: boolean;
};
/**
 * CHAOS-3900 W1: the window an answer actually speaks for once canonicalization has run. Server-computed; never accepted from the wire.
 */
export type EffectiveEvidenceWindow = EffectiveEvidenceWindow1 & {
    start?: string;
    end?: string;
    relative_id?: RelativeWindowID;
    /**
     * Open vocabulary; documented values: trend_assessment, recent_activity_lookup, state_snapshot, explicit_window. A client must tolerate values it does not know.
     */
    window_class?: string;
    /**
     * Open vocabulary; documented values: inferred_default, question_stated, clarification_confirmed. A client must tolerate values it does not know.
     */
    provenance: string;
    /**
     * Open vocabulary; documented values: high, low. A client must tolerate values it does not know.
     */
    confidence?: string;
};
export type EffectiveEvidenceWindow1 = {
    [k: string]: unknown | undefined;
};
/**
 * CHAOS-3900 W1: the closed, server-owned relative-window identifier registry (design brief v5.2 §5.1).
 */
export type RelativeWindowID = "trailing_30d" | "trailing_90d" | "trailing_365d" | "all_time";
export type InterpretedQuestion = {
    /**
     * Open vocabulary; documented values: single_subject, explicit_cohort, discovered_cohort, open. A client must tolerate values it does not know.
     */
    shape: string;
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
     * @maxItems 64
     */
    fact_requirements: FactRequirement[];
    clarification_needed: boolean;
    clarification_reason?: string;
    /**
     * CHAOS-3900 W1: the model's own sanitized, documented-vocabulary evidence-window classification pick. Absent means the model made no pick. Open vocabulary; documented values: trend_assessment, recent_activity_lookup, state_snapshot, explicit_window. A client must tolerate values it does not know.
     */
    window_class?: string;
    /**
     * Open vocabulary; documented values: high, low. A client must tolerate values it does not know.
     */
    window_confidence?: string;
    /**
     * the model's own documented-vocabulary classification of what BASIS requested_judgment asks for. Absent means the model made no pick (equivalent to unspecified) -- never derived from requested_judgment's own text by a consumer. Open vocabulary; documented values: performance, attention. A client must tolerate values it does not know.
     */
    requested_judgment_kind?: string;
};
export type TimeContext = {
    axis: "current" | "valid_time" | "observed_time" | "range";
    as_of?: string;
    start?: string;
    end?: string;
    evidence_window?: RequestedEvidenceWindow;
} & TimeContext1;
/**
 * CHAOS-3900 W1: legal ONLY when axis is current -- every other axis's own as_of/start/end already IS the window that axis answers for.
 */
export type RequestedEvidenceWindow = {
    [k: string]: unknown | undefined;
} & {
    start?: string;
    end?: string;
    relative_id?: RelativeWindowID;
};
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
/**
 * CHAOS-3900 W2, design brief section 4/DW3: closed vocabulary for how a caller wants an INFERRED (non-confirmed) evidence window disclosed. Both modes carry the same WindowClarification/EffectiveEvidenceWindow data; the mode only controls whether the disclosure is also nudged through Warnings. The empty string is the caller's own 'not set' state, mapped to headless by the engine. CHAOS-4040 (sol-max ruling 2026-08-21): every inferred window is gated out of decisive terminals regardless of this field, so the mode selects the nudge sentence on that confirmation-required terminal, not between a nudge and an otherwise-decisive answer.
 */
export type WindowConfirmationMode = "" | "headless" | "nudge";
/**
 * CHAOS-4415: the visual encoding of a "series" shape. Kind names the DATA shape, presentation names the drawing -- a bar chart and a line chart carry identical payloads, so bars are not their own kind.
 */
export type RenderPresentation = "bars" | "stacked_bars" | "line";
/**
 * CHAOS-4415: the CLOSED vocabulary of deterministic selection rules. Exactly one rule produced unknown given shape; a shape with no rule would be the default-charting this contract forbids.
 */
export type RenderShapeRule =
    "cohort_attention_score" | "cohort_driver_contribution" | "dated_fact_trend";
/**
 * CHAOS-4415: whether a point label is a category name or an ISO-8601 date/date-time. A time axis is positioned by elapsed time, never by index.
 */
export type RenderAxisKind = "category" | "time";
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
        | "ci_pipeline_run"
        | "work_item_ref";
    id?: string;
    label?: string;
    source: string;
};
export type SubjectHint1 = {
    [k: string]: unknown | undefined;
};
/**
 * CHAOS-3900 W1: one server-offered window choice, minted onto a stored result so a later turn can confirm it via winr_ receipt redemption. Start/end are the FROZEN absolute bounds computed at offer time.
 */
export type WindowOption = {
    [k: string]: unknown | undefined;
} & {
    [k: string]: unknown | undefined;
} & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    } & WindowOption1 & {
        receipt_id: string;
        option_id: string;
        label: string;
        relative_id?: RelativeWindowID;
        start?: string;
        end?: string;
    };
export type WindowOption1 =
    | {
          [k: string]: unknown | undefined;
      }
    | {
          [k: string]: unknown | undefined;
      };
export type CommitDecisionDigest = {
    subject: SubjectRef;
    /**
     * Open vocabulary; documented values: (empty), caller_hint_short_circuit, pre_committed_exact_hint, exact_index, identity_fast_path, lone_floor, top_of_two, vector_margin_rescue, evidence_census. A client must tolerate values it does not know.
     */
    commit_gate?: string;
    identity_proven?: boolean;
    search_truncated?: boolean;
    alias_lookup_complete?: boolean;
    /**
     * Open vocabulary; documented values: complete, incomplete, graph_lag, not_run_time_axis, not_wired. A client must tolerate values it does not know.
     */
    identity_lookup?: string;
};
/**
 * CHAOS-3478/CHAOS-3813: closed vocabulary for what happened to one PriorSubjectReceipts entry -- unlike StructureDisposition, a skip here never vetoes the investigation (a plural, best-effort conversational hint list degrades per-item by design), it is disclosed instead.
 */
export type PriorSubjectReceiptDisposition =
    | "applied"
    | "skipped_unloadable"
    | "skipped_no_match"
    | "skipped_stale_graph_epoch"
    | "skipped_failed_reauth";

/**
 * CHAOS-3900 P1: same shape as BoundSubjectReceipt, but receipt_id is additionally constrained to the closed ancr_ namespace -- mirrors WindowBoundReceipt's own reasoning exactly.
 */
export interface AnchorBoundReceipt {
    result_id: string;
    receipt_id: string;
}
/**
 * One requirement outcome: what the answer was supposed to contain, what became of it, and what the reader loses where it did not happen. Every field is a closed token or an integer -- never free text, which the degraded-reason and limitation channels already carry.
 */
export interface PlanRequirementOutcomeRow {
    /**
     * Which stage produced this row. Its own vocabulary, not the plan's cohort-narrowing stages: those name the three points at which the cohort is narrowed and have no member for planning or for the projection, so borrowing them would force every row to claim a stage it did not come from.
     */
    stage: "planning" | "assembled_result" | "projection" | "reuse";
    /**
     * The requirement's own identity (obligation/role/subject kind). Absent when the served document was narrowed on a turn for which no requirement rows were derived -- an honest state, and one the reader can tell apart because state is then not_derived.
     */
    requirement?: string;
    /**
     * The requirement's obligation, copied so a reader of the row alone knows what was at stake. Present exactly when requirement is.
     */
    obligation?: string;
    outcome: "satisfied" | "narrowed" | "unavailable" | "not_applicable" | "not_attempted";
    /**
     * What the reader loses. none exactly when the outcome is satisfied or not_applicable; unknown other outcome carries a real impact.
     */
    impact: "none" | "scope" | "depth" | "dimension";
    /**
     * The declared ceiling that forced the reduction, when a ceiling did.
     */
    cause_overrun?: "fits" | "items" | "bytes";
    /**
     * A coverage event that caused it, from the published coverage detail code vocabulary.
     */
    cause_coverage?: string;
    /**
     * The selection order that chose the survivors, when a selection ran.
     */
    cause_narrowing?: string;
    /**
     * Whether the named cause was REPORTED by a mechanism or DEFAULTED to. Without it a defaulted cause reads as an observed one.
     */
    cause_observed: boolean;
    served: number;
    declared: number;
    /**
     * The reduction steps behind served and declared, in order. Those two numbers are a before and an after with everything between them erased; these say which stage cut what, and on what basis.
     *
     * @maxItems 4
     */
    refinements?:
        | []
        | [RequirementRefinement]
        | [RequirementRefinement, RequirementRefinement]
        | [RequirementRefinement, RequirementRefinement, RequirementRefinement]
        | [
              RequirementRefinement,
              RequirementRefinement,
              RequirementRefinement,
              RequirementRefinement,
          ];
}
/**
 * One recorded reduction of one requirement: which stage narrowed it, on what declared basis, and from what count to what count. Modelled on PlanNarrowing, the established shape for a disclosed narrowing, one level down. Stages append; the chain runs from the row's declared count to its served count, so a reduction nobody recorded leaves a gap.
 */
export interface RequirementRefinement {
    /**
     * Which stage took this step. The enclosing row's own vocabulary, not the plan's cohort-narrowing stages: those have no member for planning, the projection or a reuse degrade.
     */
    stage: "planning" | "assembled_result" | "projection" | "reuse";
    /**
     * The declared selection order that chose the survivors, when a selection ran. Absent when a ceiling forced the reduction and no order was consulted.
     */
    basis?:
        | "canonical_id_lexical"
        | "largest_group_round_robin"
        | "attention_rank"
        | "overlap_aware_set_cover"
        | "link_strength_then_id";
    /**
     * The declared ceiling that forced the reduction, when a ceiling did. A refinement must name at least one of basis and overrun: a reduction with no cause is the generic truncation this layer exists to replace.
     */
    overrun?: "fits" | "items" | "bytes";
    /**
     * A coverage event that caused the reduction, from the published coverage detail code vocabulary. A refinement must name at least one of basis, overrun and coverage: a reduction with no cause is the generic truncation this layer exists to replace.
     */
    coverage?: string;
    before: number;
    after: number;
}
/**
 * CHAOS-4636: what the question was PLANNED to be answered with, produced by a deterministic stage between interpretation and discovery. Declares which render kinds the question authorizes (so a chart is never drawn merely because the geometry allowed it), which fact kinds it needs, and the budget it was built against.
 */
export interface AnswerPlan {
    family: QuestionFamily;
    family_source: QuestionFamilySource;
    family_version: string;
    group_kind?: SubjectKind;
    member_kind?: SubjectKind;
    require_drivers: boolean;
    require_ranking: boolean;
    /**
     * @maxItems 8
     */
    render_kinds?:
        | []
        | [RenderKind]
        | [RenderKind, RenderKind]
        | [RenderKind, RenderKind, RenderKind]
        | [RenderKind, RenderKind, RenderKind, RenderKind]
        | [RenderKind, RenderKind, RenderKind, RenderKind, RenderKind]
        | [RenderKind, RenderKind, RenderKind, RenderKind, RenderKind, RenderKind]
        | [RenderKind, RenderKind, RenderKind, RenderKind, RenderKind, RenderKind, RenderKind]
        | [
              RenderKind,
              RenderKind,
              RenderKind,
              RenderKind,
              RenderKind,
              RenderKind,
              RenderKind,
              RenderKind,
          ];
    /**
     * @maxItems 64
     *
     * Items: Open vocabulary; documented values: identity, membership, status, actual_completion, work, blockers, required_children, pull_requests, reviews, continuous_integration, deployments, incidents, metrics, health, workload, investment, readiness, operational_deficiencies, source_health, evidence, flow, landscape, security_alerts, commitment, file_hotspots. A client must tolerate values it does not know.
     */
    fact_kinds?: string[];
    /**
     * @maxItems 5
     */
    axes?:
        | []
        | [StructureNeedKind]
        | [StructureNeedKind, StructureNeedKind]
        | [StructureNeedKind, StructureNeedKind, StructureNeedKind]
        | [StructureNeedKind, StructureNeedKind, StructureNeedKind, StructureNeedKind]
        | [
              StructureNeedKind,
              StructureNeedKind,
              StructureNeedKind,
              StructureNeedKind,
              StructureNeedKind,
          ];
    budget: AnswerPlanBudget;
    /**
     * @maxItems 8
     */
    narrowing?:
        | []
        | [PlanNarrowing]
        | [PlanNarrowing, PlanNarrowing]
        | [PlanNarrowing, PlanNarrowing, PlanNarrowing]
        | [PlanNarrowing, PlanNarrowing, PlanNarrowing, PlanNarrowing]
        | [PlanNarrowing, PlanNarrowing, PlanNarrowing, PlanNarrowing, PlanNarrowing]
        | [PlanNarrowing, PlanNarrowing, PlanNarrowing, PlanNarrowing, PlanNarrowing, PlanNarrowing]
        | [
              PlanNarrowing,
              PlanNarrowing,
              PlanNarrowing,
              PlanNarrowing,
              PlanNarrowing,
              PlanNarrowing,
              PlanNarrowing,
          ]
        | [
              PlanNarrowing,
              PlanNarrowing,
              PlanNarrowing,
              PlanNarrowing,
              PlanNarrowing,
              PlanNarrowing,
              PlanNarrowing,
              PlanNarrowing,
          ];
    /**
     * The derived requirement rows this turn planned, one per coordinate. Optional: absent means no rows were derived, which the completeness state reports as not_derived.
     *
     * @maxItems 200
     */
    requirements?: PlanRequirement[];
}
/**
 * The ceiling the plan was built against and the headroom it reserved, persisted so an over-budget answer names the number that was wrong.
 */
export interface AnswerPlanBudget {
    max_items: number;
    max_serialized_bytes: number;
    max_members: number;
    synthesis_headroom: number;
    narrowing_basis: NarrowingBasis;
}
/**
 * One recorded narrowing step. On the wire because it IS the disclosure: "showing 2 of 3 teams, 3 of N projects each" is a useful partial answer only if the caller is told.
 */
export interface PlanNarrowing {
    stage: PlanNarrowingStage;
    basis: NarrowingBasis;
    before: number;
    after: number;
    groups?: boolean;
    overrun?: BudgetOverrun;
}
/**
 * One derived requirement: the obligation/role/subject coordinate, what serves it, and -- for a computation -- what that step consumes and whether anything runs it. Derived once before unknown narrowing, so it says what the answer was PLANNED to contain; the completeness outcome rows say what became of each, joined by the same coordinate string. Carries no member kind: that is written after subject resolution, and these rows are derived before it.
 */
export interface PlanRequirement {
    /**
     * The row's identity: the obligation/role/subject coordinate, "/"-separated, in that order. The same string the outcome rows carry, so the two arrays join without either minting an id.
     */
    requirement: string;
    /**
     * The obligation at stake. Mirrors the server's own vocabulary; must equal the identity's first segment. Open vocabulary; documented values: state, completion, readiness, health, principal_drivers, ranking, remaining_work, evidence, coverage, count, allocation_breakdown, trend_series, period_delta. A client must tolerate values it does not know.
     */
    obligation: string;
    /**
     * The subject role this obligation attaches to. Must equal the identity's second segment. Open vocabulary; documented values: subject, member, group, operand. A client must tolerate values it does not know.
     */
    role: string;
    /**
     * CHAOS-3900 P1: the closed ContextFabricSubjectKind vocabulary, given its own $def so KindOption/AnchorOption/HandleOption/AcceptedGrammar can $ref it directly rather than each re-duplicating the enum inline the way SubjectRef/SubjectCandidate/etc. still do at their own call sites.
     */
    subject:
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
        | "ci_pipeline_run"
        | "work_item_ref";
    /**
     * How the obligation is satisfied at all. What makes the server fields legible: a read populates fact_kinds, a computation populates step, and an unavailable cell populates neither. Open vocabulary; documented values: read, computed, answer_contract. A client must tolerate values it does not know.
     */
    kind: string;
    /**
     * @maxItems 64
     *
     * Items: Open vocabulary; documented values: identity, membership, status, actual_completion, work, blockers, required_children, pull_requests, reviews, continuous_integration, deployments, incidents, metrics, health, workload, investment, readiness, operational_deficiencies, source_health, evidence, flow, landscape, security_alerts, commitment, file_hotspots. A client must tolerate values it does not know.
     */
    fact_kinds?: string[];
    /**
     * The server step that satisfies a computed obligation. Open vocabulary; documented values: rank_cohort, membership_cardinality. A client must tolerate values it does not know.
     */
    step?: string;
    /**
     * Whether a server function actually RUNS the step. Travels with input_class because either alone misleads: a step declared to consume nothing and a step nobody executes are indistinguishable from the inputs. Open vocabulary; documented values: server_executed, declared_only. A client must tolerate values it does not know.
     */
    step_execution?: string;
    /**
     * What the computation consumes, stated positively. A step that consumes no fact and a step whose inputs nobody declared both present as an empty list; resolved_member_set says the first, an absent class says the second. Open vocabulary; documented values: fact_kinds, resolved_member_set. A client must tolerate values it does not know.
     */
    input_class?: string;
    /**
     * The fact kinds the step CONSUMES. Deliberately not fact_kinds: those are the kinds that can SERVE this cell, and a computation's inputs are facts some other cell is responsible for reading.
     *
     * @maxItems 64
     *
     * Items: Open vocabulary; documented values: identity, membership, status, actual_completion, work, blockers, required_children, pull_requests, reviews, continuous_integration, deployments, incidents, metrics, health, workload, investment, readiness, operational_deficiencies, source_health, evidence, flow, landscape, security_alerts, commitment, file_hotspots. A client must tolerate values it does not know.
     */
    input_fact_kinds?: string[];
    /**
     * The population the requirement completes over. Open vocabulary; documented values: single_subject, each_operand, each_member, each_group. A client must tolerate values it does not know.
     */
    scope: string;
    /**
     * How much of that population must be served. Always none on an unavailable row. Open vocabulary; documented values: at_least_one, corroborated, exact, all, none. A client must tolerate values it does not know.
     */
    quantifier: string;
    /**
     * Why the cell has no server, absent when it has one. Each member is actionable by a different party: a new producer, a declaration change, a query change, or nothing at all. Open vocabulary; documented values: subject_kind_unsupported, no_declaring_producer, table_shape_undeclared, computed_population_absent. A client must tolerate values it does not know.
     */
    unavailable?: string;
}
export interface BoundSubjectReceipt {
    result_id: string;
    receipt_id: string;
}
/**
 * CHAOS-4012: same shape as BoundSubjectReceipt, but receipt_id is additionally constrained to the closed candr_ namespace -- mirrors WindowBoundReceipt's own reasoning exactly.
 */
export interface CandidateBoundReceipt {
    result_id: string;
    receipt_id: string;
}
export interface SubjectRef {
    /**
     * Open vocabulary; documented values: organization, team, project, repository, work_item, pull_request, deployment, incident, document, decision, episode, metric, pull_request_review, ci_pipeline_run, work_item_ref. A client must tolerate values it does not know.
     */
    kind: string;
    canonical_id: string;
    label: string;
}
/**
 * CHAOS-4347: one row of a claimed fact's OPTIONAL renderable table. A row's own fields are plain scalars -- it never nests another table.
 */
export interface ClaimedFactRow {
    fields: {
        [k: string]: ScalarValue | undefined;
    };
}
/**
 * CHAOS-4637 / CHAOS-4627, additive and OPTIONAL: the producer's own declaration of what `rows` IS -- a closed shape, the composite key that identifies a row, and the measures. Selection keys on this declaration instead of inferring an axis and a set of measures from row geometry, which is what three defeated inferences and one withdrawn rule (dated_fact_trend) cost. ABSENT means undeclared, and an undeclared table is never charted.
 */
export interface ClaimedFactTable {
    /**
     * The canonical fact field the rows came from. A fact may carry more than one row-shaped field, so a declaration that did not name its own field would describe an unidentified table.
     */
    field: string;
    /**
     * What the table IS. `time_series` is one entity indexed by an instant (exactly one key column, parsing as an instant on every row); `breakdown` is many entities with one observation each; `ranking` is many entities ordered by the measure `order_by` names.
     */
    shape: "time_series" | "breakdown" | "ranking";
    /**
     * The COMPOSITE identity of a row, in declared order. Names ROW columns only -- row identity is relative to the fact's own subject, which is carried by `subject` and is never duplicated here. Exactly one column for `time_series`.
     *
     * @minItems 1
     * @maxItems 8
     */
    key:
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string];
    /**
     * The columns that MEASURE something. A measure may legitimately be absent from an individual row; a key column may not.
     *
     * @maxItems 32
     */
    measures?: string[];
    /**
     * CHAOS-4680: columns that vary row to row, are not part of the row's identity, and are not a quantity -- a per-day severity label, say. Every column of every row belongs to exactly one of key, measures or observations at the producer; like a measure, an observation may legitimately be absent from an individual row.
     *
     * @maxItems 32
     */
    observations?: string[];
    /**
     * For `ranking` only: which declared measure the row order is by.
     */
    order_by?: string;
}
/**
 * CHAOS-4682 (§5.1 P2), additive and OPTIONAL: declares what `time_series_rows` IS, the same way `table` declares `rows`. Its shape is ALWAYS time_series when present -- that is the entire reason this pair exists, distinct from `table`, whose shape is never time_series whenever this pair is populated.
 */
export interface ClaimedFactTable1 {
    /**
     * The canonical fact field the rows came from. A fact may carry more than one row-shaped field, so a declaration that did not name its own field would describe an unidentified table.
     */
    field: string;
    /**
     * What the table IS. `time_series` is one entity indexed by an instant (exactly one key column, parsing as an instant on every row); `breakdown` is many entities with one observation each; `ranking` is many entities ordered by the measure `order_by` names.
     */
    shape: "time_series" | "breakdown" | "ranking";
    /**
     * The COMPOSITE identity of a row, in declared order. Names ROW columns only -- row identity is relative to the fact's own subject, which is carried by `subject` and is never duplicated here. Exactly one column for `time_series`.
     *
     * @minItems 1
     * @maxItems 8
     */
    key:
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string];
    /**
     * The columns that MEASURE something. A measure may legitimately be absent from an individual row; a key column may not.
     *
     * @maxItems 32
     */
    measures?: string[];
    /**
     * CHAOS-4680: columns that vary row to row, are not part of the row's identity, and are not a quantity -- a per-day severity label, say. Every column of every row belongs to exactly one of key, measures or observations at the producer; like a measure, an observation may legitimately be absent from an individual row.
     *
     * @maxItems 32
     */
    observations?: string[];
    /**
     * For `ranking` only: which declared measure the row order is by.
     */
    order_by?: string;
}
export interface CohortExclusion {
    subject: SubjectRef;
    reason: string;
}
/**
 * CHAOS-4636: one group of a GROUPED cohort answer. Members are named by canonical id into Cohort.members rather than nested, so the flattened member list stays authoritative and a grouped answer does not pay for every member twice against the byte budget. A group carries its OWN complete/truncated, which is the representation the flat cohort booleans could not express.
 */
export interface CohortGroup {
    subject: SubjectRef;
    /**
     * @maxItems 250
     */
    member_canonical_ids: string[];
    /**
     * CHAOS-4733: carries the pre-grouping, discovery-level completeness as well as this group's own placement -- a group built from a discovery-capped cohort is never complete=true.
     */
    complete: boolean;
    /**
     * CHAOS-4733: this group's OWN presented-vs-total signal only (implies total > member_canonical_ids.length). A discovery-level cap on the whole cohort before this group existed is carried on the cohort's own truncated field instead, not here -- see Cohort.groups' description.
     */
    truncated: boolean;
    /**
     * This group's member count AS DISCOVERED when the group was built, before unknown narrowing. Not adjusted for an upstream discovery-level cap that may have left members belonging to this group undiscovered entirely; that possibility is disclosed via complete and the cohort's own truncated, never by inflating total past what was actually seen.
     */
    total: number;
}
/**
 * CHAOS-3900 P1: the wire-visible disposition for one carried structure member -- one entry per carried member, including vetoed ones.
 */
export interface ConfirmedStructureEntry {
    member: StructureNeedKind;
    applied_value: string;
    source: StructureSource;
    prior_result_id?: string;
    receipt_id?: string;
    offer_source?: StructureOfferSource;
    prior_version_id?: string;
    prior_entry_id?: string;
    provenance: StructureProvenance;
    disposition: StructureDisposition;
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
     * @maxItems 105
     */
    sources: {
        source: string;
        /**
         * Open vocabulary; documented values: available, stale, unavailable, unconfigured, unauthorized, no_data, truncated, conflicted, not_applicable, pruned. A client must tolerate values it does not know.
         */
        state: string;
        observed_at?: string;
        watermark?: string;
        reason?: string;
        label?: string;
        state_label?: string;
    }[];
    partial: boolean;
    /**
     * @maxItems 105
     */
    degraded_reasons?: string[];
    /**
     * @maxItems 105
     */
    details?: CoverageDetail[];
}
export interface CoverageDetail {
    detail_id: string;
    source: string;
    /**
     * Open vocabulary; documented values: fact_unconfigured, fact_no_declaring_producer, fact_table_shape_undeclared, fact_scope_unexpanded, fact_read_failed, fact_provider_reported, fact_pruned, fact_narrowed, graph_endpoint_lookup_failed, graph_exact_name_candidates_truncated, graph_project_deployments_unlinked, work_item_repository_unlinked, graph_cohort_denied_by_authorization, graph_unknown_relationship_type, graph_validity_unbounded, reuse_auxiliary_refs_stripped, answer_terminated_before_attempt, population_truncated, requirement_read_not_planned, read_population_unverified, fact_read_origin_state, kind_census_truncated, graph_walk_cut_before_member, computed_population_absent, requirement_not_evaluable, graph_no_member_found, synthesis_input_bounded, synthesis_model_failed, synthesis_not_run, fact_score_withheld. A client must tolerate values it does not know.
     */
    code: string;
    degrading: boolean;
    fact_kind?: string;
    source_state?: string;
    scope_outcome?: string;
    origin_kind?: string;
    /**
     * @maxItems 32
     */
    supported_kinds?: string[];
    /**
     * @maxItems 32
     */
    skipped_kinds?: string[];
    policy?: string;
    basis?: string;
    count?: number;
    narrowed?: boolean;
    label: string;
    phrasing?: string;
    raw?: string;
    /**
     * Open vocabulary; documented values: organization, team, project, repository, work_item, pull_request, deployment, incident, document, decision, episode, metric, pull_request_review, ci_pipeline_run, work_item_ref. A client must tolerate values it does not know.
     */
    kind?: string;
    declared?: number;
    served?: number;
    /**
     * Open vocabulary; documented values: model_output_invalid, synthesis_rejected, model_receipt_unrecorded, model_call_not_completed, synthesis_deadline, synthesis_not_narrowable, synthesis_rows_over_budget, synthesis_retry_over_budget. A client must tolerate values it does not know.
     */
    failure_class?: string;
    /**
     * Open vocabulary; documented values: retry_may_succeed, retry_unlikely_to_help. A client must tolerate values it does not know.
     */
    retry_hint?: string;
}
/**
 * CHAOS-5405 D-d: one attempted requirement/origin scope decision, as served -- what population was measured, how much of it the caller was authorized to see, how much was admitted, and whether the answer was cut short. It is SERVED rather than only logged because two distinctions the answer depends on cannot be recovered from anything else on the result: a measured zero versus an unmeasured population, and which policy a successful expansion ran on. Counts from overlapping origin groups are NOT additive, and authorized_population_count always means the CALLER-VISIBLE population, never the organization's unrestricted one.
 */
export interface FactScopeCensusRecord {
    requirement_kind: string;
    origin_kind: string;
    policy: string;
    basis: string;
    axis: string;
    outcome: string;
    target_limit: number;
    population_measured: boolean;
    /**
     * NULLABLE on purpose: null means the census did not complete, 0 means it completed and the caller-visible authorized population is genuinely none. A non-nullable integer would make those two answers the same document, which is the ambiguity this record exists to remove.
     */
    authorized_population_count: number | null;
    admitted_count: number;
    truncated: boolean;
}
export interface Finding {
    finding_id: string;
    /**
     * Open vocabulary; documented values: status, actual_completion, work, blockers, reviews, continuous_integration, deployments, incidents, health, workload, investment, readiness, operational_deficiency, source_health, relationship, narrative. A client must tolerate values it does not know.
     */
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
/**
 * CHAOS-3900 P1: same shape as BoundSubjectReceipt, but receipt_id is additionally constrained to the closed handr_ namespace -- mirrors WindowBoundReceipt's own reasoning exactly.
 */
export interface HandleBoundReceipt {
    result_id: string;
    receipt_id: string;
}
export interface FactRequirement {
    /**
     * Open vocabulary; documented values: identity, membership, status, actual_completion, work, blockers, required_children, pull_requests, reviews, continuous_integration, deployments, incidents, metrics, health, workload, investment, readiness, operational_deficiencies, source_health, evidence, flow, landscape, security_alerts, commitment, file_hotspots. A client must tolerate values it does not know.
     */
    kind: string;
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
    answer_budget_bytes?: number;
    allow_clarification: boolean;
    include_debug: boolean;
    window_confirmation_mode?: WindowConfirmationMode;
}
/**
 * CHAOS-3900 P1: same shape as BoundSubjectReceipt, but receipt_id is additionally constrained to the closed kindr_ namespace (pivot-intent design brief section 2's closed kindr_/ancr_/handr_/winr_ set) -- mirrors WindowBoundReceipt's own reasoning exactly.
 */
export interface KindBoundReceipt {
    result_id: string;
    receipt_id: string;
}
export interface RelationshipPath {
    path_id: string;
    /**
     * @minItems 2
     * @maxItems 51
     */
    nodes: [SubjectRef, SubjectRef, ...SubjectRef[]];
    /**
     * @minItems 1
     * @maxItems 50
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
    /**
     * Open vocabulary; documented values: BELONGS_TO_REPOSITORY, BELONGS_TO_PULL_REQUEST, CORRELATED_WITH_INCIDENT, RELATED_TO, DOCUMENTED_BY, HAS_EPISODE, BLOCKS, PART_OF, RELATES_TO, DUPLICATES, BELONGS_TO_PROJECT, OWNED_BY_TEAM, LINKS_PULL_REQUEST. A client must tolerate values it does not know.
     */
    type: string;
    from: SubjectRef;
    to: SubjectRef;
    /**
     * Open vocabulary; documented values: canonical_structured, deterministic_projection, graph_associated, model_extracted, rule_inferred. A client must tolerate values it does not know.
     */
    derivation: string;
    /**
     * Open vocabulary; documented values: observed, source_asserted, inferred, disputed, superseded, unknown. A client must tolerate values it does not know.
     */
    epistemic_status: string;
    observed_at?: string;
    valid_from?: string;
    valid_to?: string;
    /**
     * @minItems 1
     * @maxItems 100
     */
    evidence_ref_ids: [string, ...string[]];
}
/**
 * CHAOS-4415: ONE renderable shape an answer carries, selected by a deterministic rule from the interpreted intent and the facts the answer already holds. Conditional on intent, never default.
 */
export interface RenderShape {
    shape_id: string;
    kind: RenderKind;
    presentation?: RenderPresentation;
    selected_by: RenderShapeRule;
    title: string;
    axis_kind: RenderAxisKind;
    axis_label: string;
    value_label: string;
    /**
     * @minItems 1
     * @maxItems 8
     */
    series:
        | [RenderSeries]
        | [RenderSeries, RenderSeries]
        | [RenderSeries, RenderSeries, RenderSeries]
        | [RenderSeries, RenderSeries, RenderSeries, RenderSeries]
        | [RenderSeries, RenderSeries, RenderSeries, RenderSeries, RenderSeries]
        | [RenderSeries, RenderSeries, RenderSeries, RenderSeries, RenderSeries, RenderSeries]
        | [
              RenderSeries,
              RenderSeries,
              RenderSeries,
              RenderSeries,
              RenderSeries,
              RenderSeries,
              RenderSeries,
          ]
        | [
              RenderSeries,
              RenderSeries,
              RenderSeries,
              RenderSeries,
              RenderSeries,
              RenderSeries,
              RenderSeries,
              RenderSeries,
          ];
}
/**
 * CHAOS-4415: one named line/bar family within a shape. A series with no point for a label has a genuine gap there -- never a zero.
 */
export interface RenderSeries {
    key: string;
    label: string;
    /**
     * @minItems 1
     * @maxItems 64
     */
    points: [RenderPoint, ...RenderPoint[]];
}
/**
 * CHAOS-4415: one plotted number and its provenance.
 */
export interface RenderPoint {
    label: string;
    value: number;
    source: RenderPointSource;
}
/**
 * CHAOS-4415: where in THIS SAME document a plotted number came from. Validation resolves it and requires exact equality, so a chart number can never be authored, re-derived, rounded or aggregated.
 */
export interface RenderPointSource {
    kind: "cohort_member_score" | "cohort_driver_weight_contributed" | "claimed_fact_row";
    subject_canonical_id?: string;
    signal?: string;
    claim_id?: string;
    row_index?: number;
    field?: string;
}
/**
 * CHAOS-3972 P3, design brief section 2.3: one caller-supplied explicit subject_handle value -- a typed (kind, pattern_id, value) triple the engine grammar-validates before it may become a receipt-bound HandleOption offer.
 */
export interface RequestedHandle {
    kind: SubjectKind;
    pattern_id: string;
    value: string;
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
/**
 * CHAOS-3900 P1: the disclosure block -- present whenever an investigation round ends short of decisive. relation_family and cohort_shape are unrepresentable here by design (design brief section 1.1's demotion).
 */
export interface StructureNeeds {
    /**
     * @minItems 1
     * @maxItems 5
     */
    missing:
        | [StructureNeedKind]
        | [StructureNeedKind, StructureNeedKind]
        | [StructureNeedKind, StructureNeedKind, StructureNeedKind]
        | [StructureNeedKind, StructureNeedKind, StructureNeedKind, StructureNeedKind]
        | [
              StructureNeedKind,
              StructureNeedKind,
              StructureNeedKind,
              StructureNeedKind,
              StructureNeedKind,
          ];
    /**
     * @maxItems 20
     */
    kind_options?:
        | []
        | [KindOption]
        | [KindOption, KindOption]
        | [KindOption, KindOption, KindOption]
        | [KindOption, KindOption, KindOption, KindOption]
        | [KindOption, KindOption, KindOption, KindOption, KindOption]
        | [KindOption, KindOption, KindOption, KindOption, KindOption, KindOption]
        | [KindOption, KindOption, KindOption, KindOption, KindOption, KindOption, KindOption]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ];
    /**
     * @maxItems 20
     */
    anchor_options?:
        | []
        | [AnchorOption]
        | [AnchorOption, AnchorOption]
        | [AnchorOption, AnchorOption, AnchorOption]
        | [AnchorOption, AnchorOption, AnchorOption, AnchorOption]
        | [AnchorOption, AnchorOption, AnchorOption, AnchorOption, AnchorOption]
        | [AnchorOption, AnchorOption, AnchorOption, AnchorOption, AnchorOption, AnchorOption]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ]
        | [
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
              AnchorOption,
          ];
    /**
     * @maxItems 20
     */
    handle_options?:
        | []
        | [HandleOption]
        | [HandleOption, HandleOption]
        | [HandleOption, HandleOption, HandleOption]
        | [HandleOption, HandleOption, HandleOption, HandleOption]
        | [HandleOption, HandleOption, HandleOption, HandleOption, HandleOption]
        | [HandleOption, HandleOption, HandleOption, HandleOption, HandleOption, HandleOption]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ];
    /**
     * @maxItems 20
     */
    window_options?:
        | []
        | [WindowOption]
        | [WindowOption, WindowOption]
        | [WindowOption, WindowOption, WindowOption]
        | [WindowOption, WindowOption, WindowOption, WindowOption]
        | [WindowOption, WindowOption, WindowOption, WindowOption, WindowOption]
        | [WindowOption, WindowOption, WindowOption, WindowOption, WindowOption, WindowOption]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ];
    /**
     * @maxItems 20
     */
    accepted_grammars?:
        | []
        | [AcceptedGrammar]
        | [AcceptedGrammar, AcceptedGrammar]
        | [AcceptedGrammar, AcceptedGrammar, AcceptedGrammar]
        | [AcceptedGrammar, AcceptedGrammar, AcceptedGrammar, AcceptedGrammar]
        | [AcceptedGrammar, AcceptedGrammar, AcceptedGrammar, AcceptedGrammar, AcceptedGrammar]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ];
    /**
     * @maxItems 20
     */
    candidate_options?:
        | []
        | [CandidateOption]
        | [CandidateOption, CandidateOption]
        | [CandidateOption, CandidateOption, CandidateOption]
        | [CandidateOption, CandidateOption, CandidateOption, CandidateOption]
        | [CandidateOption, CandidateOption, CandidateOption, CandidateOption, CandidateOption]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ];
    /**
     * @maxItems 1
     */
    window_expand_options?: [] | [WindowExpandOption];
}
/**
 * CHAOS-3900 P1: one server-offered census-kind choice, minted onto a stored result so a later turn can confirm it via kindr_ receipt redemption.
 */
export interface KindOption {
    receipt_id: string;
    option_id: string;
    label: string;
    kind: SubjectKind;
    offer_source: StructureOfferSource;
    prior_version_id?: string;
    prior_entry_id?: string;
    phrasing?: string;
}
/**
 * CHAOS-3900 P1: one server-offered unique-claimant anchor candidate, minted onto a stored result so a later turn can confirm it via ancr_ receipt redemption. Re-verification identity is (kind, canonical_id, matched_term_hash) -- see internal/contextfabric's verifyAnchorClaimantUnique. matched_term_hash is the SHA-256 digest of the normalized matched term, never the raw term.
 */
export interface AnchorOption {
    receipt_id: string;
    option_id: string;
    label: string;
    kind: SubjectKind;
    canonical_id: string;
    matched_term_hash: string;
    offer_source: StructureOfferSource;
    prior_version_id?: string;
    prior_entry_id?: string;
    phrasing?: string;
}
/**
 * CHAOS-3900 P1: one server-offered grammar-valid handle candidate, minted onto a stored result so a later turn can confirm it via handr_ receipt redemption. pattern_id names the closed handle-grammar registry pattern -- never regex text on the wire.
 */
export interface HandleOption {
    receipt_id: string;
    option_id: string;
    label: string;
    kind: SubjectKind;
    pattern_id: string;
    value: string;
    source_column: string;
    offer_source: StructureOfferSource;
    prior_version_id?: string;
    prior_entry_id?: string;
    phrasing?: string;
}
/**
 * CHAOS-3900 P1: discloses one grammar the engine accepts for explicit supply (design brief section 2.1). pattern_id is registry-pinned, never regex text.
 */
export interface AcceptedGrammar {
    member: StructureNeedKind;
    kind?: SubjectKind;
    pattern_id: string;
}
/**
 * CHAOS-4012: one server-offered top-ranked SubjectCandidate from the resolution's own pool, minted onto a stored result so a later turn can confirm it via candr_ receipt redemption. Fires independently of KindOption above -- offered whenever nothing committed and the pool is non-empty, regardless of how many distinct kinds it spans. Field shape mirrors AnchorOption minus matched_term_hash: a candidate claims no per-term uniqueness, so there is no hash to re-verify.
 */
export interface CandidateOption {
    receipt_id: string;
    option_id: string;
    label: string;
    kind: SubjectKind;
    canonical_id: string;
    offer_source: StructureOfferSource;
    prior_version_id?: string;
    prior_entry_id?: string;
    phrasing?: string;
}
/**
 * CHAOS-4314; semantics widened CHAOS-4336: a gated window's recommendation that a wider tier is available to try -- presence is a statement about tier ordering alone, never evidence that an offers-only pool was found non-empty (see candidate_label/candidate_kind, now genuinely optional). receipt_id/option_id/label/relative_id are copied VERBATIM from one entry the same result's own window_options already carries (no fresh bounds here -- redemption applies the referenced WindowOption's own frozen start/end, never a value on this type).
 */
export interface WindowExpandOption {
    receipt_id: string;
    option_id: string;
    label: string;
    relative_id?: RelativeWindowID;
    /**
     * Open vocabulary; documented values: trend_assessment, recent_activity_lookup, state_snapshot, explicit_window. A client must tolerate values it does not know.
     */
    window_class?: string;
    candidate_label?: string;
    candidate_kind?: SubjectKind;
}
/**
 * CHAOS-4042: the disclosure block carried on a context_fabric_investigation_result.v2 result -- identical to StructureNeeds except anchor_options items are AnchorOptionV2 (membership-verify semantics) rather than AnchorOption (unique-claimant). kind_options/handle_options/window_options/accepted_grammars are unchanged from v1.
 */
export interface StructureNeedsV2 {
    /**
     * @minItems 1
     * @maxItems 5
     */
    missing:
        | [StructureNeedKind]
        | [StructureNeedKind, StructureNeedKind]
        | [StructureNeedKind, StructureNeedKind, StructureNeedKind]
        | [StructureNeedKind, StructureNeedKind, StructureNeedKind, StructureNeedKind]
        | [
              StructureNeedKind,
              StructureNeedKind,
              StructureNeedKind,
              StructureNeedKind,
              StructureNeedKind,
          ];
    /**
     * @maxItems 20
     */
    kind_options?:
        | []
        | [KindOption]
        | [KindOption, KindOption]
        | [KindOption, KindOption, KindOption]
        | [KindOption, KindOption, KindOption, KindOption]
        | [KindOption, KindOption, KindOption, KindOption, KindOption]
        | [KindOption, KindOption, KindOption, KindOption, KindOption, KindOption]
        | [KindOption, KindOption, KindOption, KindOption, KindOption, KindOption, KindOption]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ]
        | [
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
              KindOption,
          ];
    /**
     * @maxItems 20
     */
    anchor_options?:
        | []
        | [AnchorOptionV2]
        | [AnchorOptionV2, AnchorOptionV2]
        | [AnchorOptionV2, AnchorOptionV2, AnchorOptionV2]
        | [AnchorOptionV2, AnchorOptionV2, AnchorOptionV2, AnchorOptionV2]
        | [AnchorOptionV2, AnchorOptionV2, AnchorOptionV2, AnchorOptionV2, AnchorOptionV2]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ]
        | [
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
              AnchorOptionV2,
          ];
    /**
     * @maxItems 20
     */
    handle_options?:
        | []
        | [HandleOption]
        | [HandleOption, HandleOption]
        | [HandleOption, HandleOption, HandleOption]
        | [HandleOption, HandleOption, HandleOption, HandleOption]
        | [HandleOption, HandleOption, HandleOption, HandleOption, HandleOption]
        | [HandleOption, HandleOption, HandleOption, HandleOption, HandleOption, HandleOption]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ]
        | [
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
              HandleOption,
          ];
    /**
     * @maxItems 20
     */
    window_options?:
        | []
        | [WindowOption]
        | [WindowOption, WindowOption]
        | [WindowOption, WindowOption, WindowOption]
        | [WindowOption, WindowOption, WindowOption, WindowOption]
        | [WindowOption, WindowOption, WindowOption, WindowOption, WindowOption]
        | [WindowOption, WindowOption, WindowOption, WindowOption, WindowOption, WindowOption]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ];
    /**
     * @maxItems 20
     */
    accepted_grammars?:
        | []
        | [AcceptedGrammar]
        | [AcceptedGrammar, AcceptedGrammar]
        | [AcceptedGrammar, AcceptedGrammar, AcceptedGrammar]
        | [AcceptedGrammar, AcceptedGrammar, AcceptedGrammar, AcceptedGrammar]
        | [AcceptedGrammar, AcceptedGrammar, AcceptedGrammar, AcceptedGrammar, AcceptedGrammar]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ]
        | [
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
              AcceptedGrammar,
          ];
    /**
     * @maxItems 20
     */
    candidate_options?:
        | []
        | [CandidateOption]
        | [CandidateOption, CandidateOption]
        | [CandidateOption, CandidateOption, CandidateOption]
        | [CandidateOption, CandidateOption, CandidateOption, CandidateOption]
        | [CandidateOption, CandidateOption, CandidateOption, CandidateOption, CandidateOption]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ]
        | [
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
              CandidateOption,
          ];
    /**
     * @maxItems 1
     */
    window_expand_options?: [] | [WindowExpandOption];
}
/**
 * CHAOS-4042 (sol-max ruling): one server-offered anchor candidate under MEMBERSHIP-VERIFY semantics -- the claimant set is NOT required to be unique. Redemption re-verifies that (kind, canonical_id) remains a member of the term's complete claimant set at the pinned ResolvedGraphBinding epoch, matched by (matched_term_hash, kind, canonical_id) together, never id or hash alone. Wire shape is identical to v1 AnchorOption; only the meaning differs, which is why this is a distinct, permanently-separate contract rather than a v1 revision. Only ever carried on a result whose schema_version is context_fabric_investigation_result.v2 -- a v1 result (context_fabric_investigation_result.v1) uses AnchorOption and stays unique-claimant permanently.
 */
export interface AnchorOptionV2 {
    receipt_id: string;
    option_id: string;
    label: string;
    kind: SubjectKind;
    canonical_id: string;
    matched_term_hash: string;
    offer_source: StructureOfferSource;
    prior_version_id?: string;
    prior_entry_id?: string;
    phrasing?: string;
}
/**
 * CHAOS-3900 P1: one echoed offer inside a decisive result's structure_offer_snapshot (design brief section 2.1's B5 gap). Ids/ranks/enums only, never display text.
 */
export interface StructureOfferSnapshotEntry {
    member: StructureNeedKind;
    offer_id: string;
    rank: number;
    offer_source: StructureOfferSource;
    prior_version_id?: string;
    prior_entry_id?: string;
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
    /**
     * @maxItems 50
     */
    inactive_hints?: InactiveHint[];
    retrieval_degraded?: boolean;
    graph_not_projected?: boolean;
    /**
     * @maxItems 250
     */
    commit_decision_digests?: CommitDecisionDigest[];
    /**
     * @maxItems 20
     */
    prior_subject_receipt_dispositions?:
        | []
        | [PriorSubjectReceiptDispositionEntry]
        | [PriorSubjectReceiptDispositionEntry, PriorSubjectReceiptDispositionEntry]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ]
        | [
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
              PriorSubjectReceiptDispositionEntry,
          ];
}
export interface SubjectCandidate {
    receipt_id: string;
    subject: SubjectRef;
    /**
     * Open vocabulary; documented values: committed, proposed, ambiguous, unresolved. A client must tolerate values it does not know.
     */
    state: string;
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
     * Source provider of the subject. Present when exactly one provider identifies the subject.
     */
    provider?: string;
    /**
     * @maxItems 6
     */
    match_mechanisms?:
        | []
        | ["exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent"]
        | [
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
          ]
        | [
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
          ]
        | [
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
          ]
        | [
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
          ]
        | [
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
              "exact" | "alias" | "provider_key" | "lexical" | "vector" | "traversal_parent",
          ];
    /**
     * @maxItems 100
     */
    evidence_ref_ids?: string[];
}
export interface InactiveHint {
    subject: SubjectRef;
    answer: "team_inactive";
    active_canonical_id?: string;
}
/**
 * CHAOS-3478/CHAOS-3813: the wire-visible disposition for one PriorSubjectReceipts entry the caller sent -- one entry per carried receipt, including skipped ones.
 */
export interface PriorSubjectReceiptDispositionEntry {
    prior_result_id: string;
    receipt_id: string;
    disposition: PriorSubjectReceiptDisposition;
}
/**
 * The time an answer actually speaks for on a historical time axis (CHAOS-3781, AC-3781-2). Absent on the current axis. Effective is always narrower than or equal to requested; an answer may speak for less time than was asked about, never more.
 */
export interface TemporalLabel {
    requested: TimeContext & {
        axis?: "valid_time" | "observed_time" | "range";
        [k: string]: unknown | undefined;
    };
    effective: TimeContext & {
        axis?: "valid_time" | "observed_time" | "range";
        [k: string]: unknown | undefined;
    };
    grain: "instant" | "day" | "none";
    coverage_complete: boolean;
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
     * CHAOS-3782: the provider/model of the model call that produced this result: its synthesis, or the interpretation call when the result ended without one (synthesis_version then reads not_synthesized), e.g. "openai-compatible/gpt-5-nano". Never a bare vendor name. Optional: rows persisted before this field existed (or by unknown writer with answer reuse disabled) omit it entirely; absence never blocks reading an existing result, and never makes that result reuse-eligible either (reuse also requires question_hash, absent on the same rows for the same reason). maxLength is provider (<=256) + "/" + model (<=256) = 513, not the 256 shared by every other field here -- those are short deployment/prompt version tokens ACR itself controls.
     */
    model_identity?: string;
    /**
     * Who interpreted the question of this result: the service's own model (server) or the caller's (client). Optional: absent when no interpretation ran on the turn. A stored result written before the field existed is served with server when its interpretation_version names a version, and without the field when its interpretation_version is unwired.
     */
    interpretation_source?: "server" | "client";
    /**
     * The model that interpreted the question of this result: <provider>/<model> for the service's own model, client-supplied/<declared model or undeclared> for the caller's. A client interpretation_source requires the client-supplied prefix and no other source may carry it. Optional: a stored result written before the field existed is served with a server interpretation_source and without this field.
     */
    interpretation_model_identity?: string;
    /**
     * Who wrote the answer of this result: the service's own model (server) or the caller's (client). Optional: absent when no synthesis step ran on the turn. A client result carries no model-written drivers or claims; the caller wrote the answer from the synthesis input of its turn. The status of a client result is partial, or degraded when the service finds a required source unavailable, or no_match; never complete.
     */
    synthesis_source?: "server" | "client";
}
/**
 * CHAOS-3900 W1: same shape as BoundSubjectReceipt, but receipt_id is additionally constrained to the closed winr_ namespace (design brief section 5, pivot brief section 2's closed kindr_/ancr_/handr_/winr_ set) -- a separate type, not a reuse of BoundSubjectReceipt, so the schema itself rejects a subject-namespaced id in prior_window_receipts the same way validate_context_fabric_request.go does.
 */
export interface WindowBoundReceipt {
    result_id: string;
    receipt_id: string;
}
/**
 * CHAOS-3900 W1: every window option a stored result offered. RESIDUAL, SERVER-SIDE-ONLY INVARIANT (codex round 7): options.uniqueItems below rejects two options that are structurally identical in EVERY field, but standard JSON Schema (draft 2020-12) has no keyword to express uniqueness on a DERIVED SUBSET of fields -- so two options differing only in, say, label but sharing the same receipt_id or option_id pass this schema even though ContextFabricWindowClarification.Validate (validate_context_fabric_window.go, the design brief's own 'm5' invariant) rejects them. That per-field uniqueness is enforced by Go alone; it is not expressible here.
 */
export interface WindowClarification {
    /**
     * @minItems 1
     * @maxItems 20
     */
    options:
        | [WindowOption]
        | [WindowOption, WindowOption]
        | [WindowOption, WindowOption, WindowOption]
        | [WindowOption, WindowOption, WindowOption, WindowOption]
        | [WindowOption, WindowOption, WindowOption, WindowOption, WindowOption]
        | [WindowOption, WindowOption, WindowOption, WindowOption, WindowOption, WindowOption]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ]
        | [
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
              WindowOption,
          ];
}
