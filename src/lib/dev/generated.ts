/* eslint-disable @typescript-eslint/no-namespace */
// Generated from full-chaos/dev-health-ops 6b7517364eee330efd01e1c238eb50245760a62d. Do not edit.
export namespace DevAnswerContract {
    export type AnswerId = string;
    export type AsOf = string;
    export type ClaimId = string;
    export type Confidence = number;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds = string[];
    export type Conflicting = boolean;
    export type Stale = boolean;
    export type Uncertain = boolean;
    export type UntrustedSource = boolean;
    export type ClaimKind = "observed" | "inferred" | "recommendation";
    /**
     * @maxItems 12
     */
    export type MetricRefIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
          ];
    export type RecommendationRuleVersion = string | null;
    export type SchemaVersion = "dev_claim.v1";
    export type Text = string;
    export type End = string;
    export type Start = string;
    export type Timezone = string;
    export type DirectScope =
        "organization" | "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    /**
     * @maxItems 20
     */
    export type EntityRefs =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type DisplayLabel = string;
    export type EntityId = string;
    export type EntityType =
        "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    export type RepositoryId = string | null;
    export type OrganizationId = string;
    /**
     * @maxItems 20
     */
    export type Repositories =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion1 = "dev_scope.v1";
    /**
     * @maxItems 20
     */
    export type EntityRefs1 =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type FilterFingerprint = string | null;
    export type AskDevSurfaceRouteID =
        | "diagnose_overview"
        | "flow_metrics"
        | "investment"
        | "work_graph"
        | "complexity"
        | "cognitive_load"
        | "bottlenecks"
        | "repository_detail"
        | "project_detail"
        | "work_unit_detail"
        | "issue_detail"
        | "pull_request_detail"
        | "data_health";
    /**
     * @maxItems 20
     */
    export type TeamIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    /**
     * @maxItems 100
     */
    export type Claims = DevClaim[];
    /**
     * @maxItems 20
     */
    export type Conflicts =
        | []
        | [DevConflict]
        | [DevConflict, DevConflict]
        | [DevConflict, DevConflict, DevConflict]
        | [DevConflict, DevConflict, DevConflict, DevConflict]
        | [DevConflict, DevConflict, DevConflict, DevConflict, DevConflict]
        | [DevConflict, DevConflict, DevConflict, DevConflict, DevConflict, DevConflict]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ];
    /**
     * @minItems 2
     * @maxItems 10
     */
    export type EvidenceRefIds1 =
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string];
    export type Summary = string;
    export type ConversationId = string;
    export type AsOf1 = string;
    export type AvailableSourceCount = number;
    /**
     * @maxItems 25
     */
    export type DegradedRequiredSources = string[];
    export type RequiredSourceCount = number;
    /**
     * @maxItems 25
     */
    export type StaleRequiredSources = string[];
    /**
     * @maxItems 25
     */
    export type UnavailableRequiredSources = string[];
    export type DirectSummary = string;
    export type CitationText = string | null;
    export type Confidence1 = number;
    export type DisplayLabel1 = string;
    export type EntityId1 = string;
    export type EntityType1 = string;
    export type EvidenceRefId = string;
    export type Conflicting1 = boolean;
    export type Deleted = boolean;
    export type Redacted = boolean;
    export type Stale1 = boolean;
    export type Unavailable = boolean;
    export type Uncertain1 = boolean;
    export type UntrustedContent = boolean;
    export type FreshnessState = "fresh" | "stale" | "unavailable" | "unknown";
    export type InternalPath = string | null;
    export type SourceUrl = string | null;
    export type ObservedAt = string;
    export type Provenance = string;
    /**
     * @maxItems 20
     */
    export type RepositoryIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion2 = "dev_evidence_ref.v1";
    export type SourceSystem = string;
    export type SourceVersion = string;
    /**
     * @maxItems 20
     */
    export type ValidEntityIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    /**
     * @maxItems 25
     */
    export type Evidence = DevEvidenceRef[];
    export type GeneratedAt = string;
    /**
     * @maxItems 12
     */
    export type Metrics =
        | []
        | [DevMetricRef]
        | [DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ];
    export type Aggregation = string;
    export type ComparisonValue = number | null;
    export type Coverage = number;
    export type DefinitionVersion = string;
    /**
     * @maxItems 12
     */
    export type Dimensions =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
          ];
    export type DisplayPrecision = number;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds2 = string[];
    export type Label = string;
    export type MetricID =
        | "items_completed"
        | "cycle_time_p50_hours"
        | "avg_wip"
        | "deployments_count"
        | "change_failure_rate"
        | "investment_allocation_pct"
        | "cyclomatic_per_kloc"
        | "compounding_risk_score";
    export type MetricRefId = string;
    export type QueryVersion = string;
    export type SchemaVersion3 = "dev_metric_ref.v1";
    export type Timestamp = string;
    export type Value = number;
    /**
     * @maxItems 366
     */
    export type Series = DevMetricPoint[];
    export type SourceVersion1 = string;
    export type Unit = string;
    export type Value1 = number | null;
    export type ModelFingerprint = string;
    export type ProviderFamily = string;
    export type ProviderSource = "platform" | "byo";
    /**
     * @maxItems 20
     */
    export type AuthorizedEntityIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    /**
     * @maxItems 20
     */
    export type AuthorizedRepositoryIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type Reason = string;
    export type RepositoryId1 = string | null;
    /**
     * @maxItems 25
     */
    export type Candidates = DevDisambiguationCandidate[];
    /**
     * @maxItems 10
     */
    export type Fallbacks =
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string];
    export type ScopeResolutionOutcome =
        | "exact"
        | "filtered"
        | "inherited"
        | "organization_fallback"
        | "ambiguous"
        | "unresolved"
        | "forbidden_or_not_found";
    export type ResolvedAt = string;
    export type SchemaVersion4 = "dev_scope_resolution.v1";
    /**
     * @maxItems 20
     */
    export type Warnings =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion5 = "dev_answer.v1";
    export type AnswerStatus =
        "complete" | "partial" | "degraded" | "insufficient_evidence" | "refused" | "error";
    /**
     * @maxItems 10
     */
    export type SuggestedFollowUpQuestions =
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string];
    export type MetricDefinitionVersion = string;
    export type PromptVersion = string;
    export type QueryVersion1 = string;
    export type ToolContractVersion = string;
    /**
     * @maxItems 20
     */
    export type Warnings1 =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];

    export interface DevAnswer {
        answer_id: AnswerId;
        as_of: AsOf;
        claims?: Claims;
        conflicts?: Conflicts;
        conversation_id: ConversationId;
        coverage: DevCoverage;
        direct_summary: DirectSummary;
        evidence?: Evidence;
        generated_at: GeneratedAt;
        metrics?: Metrics;
        model: DevModelMetadata;
        resolved_scope: DevScopeResolution;
        schema_version: SchemaVersion5;
        status: AnswerStatus;
        suggested_follow_up_questions?: SuggestedFollowUpQuestions;
        versions: DevContractVersions;
        warnings?: Warnings1;
    }
    export interface DevClaim {
        claim_id: ClaimId;
        confidence: Confidence;
        evidence_ref_ids?: EvidenceRefIds;
        flags: DevClaimFlags;
        kind: ClaimKind;
        metric_ref_ids?: MetricRefIds;
        recommendation_rule_version?: RecommendationRuleVersion;
        schema_version: SchemaVersion;
        text: Text;
        validity_scope: DevScope;
    }
    export interface DevClaimFlags {
        conflicting?: Conflicting;
        stale?: Stale;
        uncertain?: Uncertain;
        untrusted_source?: UntrustedSource;
    }
    export interface DevScope {
        comparison_range?: DevTimeRange | null;
        direct_scope: DirectScope;
        entity_refs?: EntityRefs;
        organization_id: OrganizationId;
        repositories?: Repositories;
        schema_version: SchemaVersion1;
        surface_context?: DevSurfaceContext | null;
        team_ids?: TeamIds;
        time_range: DevTimeRange;
    }
    export interface DevTimeRange {
        end: End;
        start: Start;
        timezone: Timezone;
    }
    export interface DevEntityRef {
        display_label: DisplayLabel;
        entity_id: EntityId;
        entity_type: EntityType;
        repository_id?: RepositoryId;
    }
    export interface DevSurfaceContext {
        entity_refs?: EntityRefs1;
        filter_fingerprint?: FilterFingerprint;
        route_id: AskDevSurfaceRouteID;
    }
    export interface DevConflict {
        evidence_ref_ids: EvidenceRefIds1;
        summary: Summary;
    }
    export interface DevCoverage {
        as_of: AsOf1;
        available_source_count: AvailableSourceCount;
        degraded_required_sources?: DegradedRequiredSources;
        required_source_count: RequiredSourceCount;
        stale_required_sources?: StaleRequiredSources;
        unavailable_required_sources?: UnavailableRequiredSources;
    }
    export interface DevEvidenceRef {
        citation_text?: CitationText;
        confidence: Confidence1;
        display_label: DisplayLabel1;
        entity_id: EntityId1;
        entity_type: EntityType1;
        evidence_ref_id: EvidenceRefId;
        flags: DevEvidenceFlags;
        freshness: FreshnessState;
        link?: DevCitationLink | null;
        observed_at: ObservedAt;
        provenance: Provenance;
        repository_ids?: RepositoryIds;
        schema_version: SchemaVersion2;
        source_system: SourceSystem;
        source_version: SourceVersion;
        valid_entity_ids?: ValidEntityIds;
    }
    export interface DevEvidenceFlags {
        conflicting?: Conflicting1;
        deleted?: Deleted;
        redacted?: Redacted;
        stale?: Stale1;
        unavailable?: Unavailable;
        uncertain?: Uncertain1;
        untrusted_content?: UntrustedContent;
    }
    export interface DevCitationLink {
        internal_path?: InternalPath;
        source_url?: SourceUrl;
    }
    export interface DevMetricRef {
        aggregation: Aggregation;
        comparison_value?: ComparisonValue;
        comparison_window?: DevTimeRange | null;
        coverage: Coverage;
        current_window: DevTimeRange;
        definition_version: DefinitionVersion;
        dimensions?: Dimensions;
        display_precision: DisplayPrecision;
        evidence_ref_ids?: EvidenceRefIds2;
        freshness: FreshnessState;
        label: Label;
        metric_id: MetricID;
        metric_ref_id: MetricRefId;
        query_version: QueryVersion;
        resolved_scope: DevScope;
        schema_version: SchemaVersion3;
        series?: Series;
        source_version: SourceVersion1;
        unit: Unit;
        value?: Value1;
    }
    export interface DevMetricPoint {
        timestamp: Timestamp;
        value: Value;
    }
    export interface DevModelMetadata {
        model_fingerprint: ModelFingerprint;
        provider_family: ProviderFamily;
        provider_source: ProviderSource;
    }
    export interface DevScopeResolution {
        authorized_entity_ids?: AuthorizedEntityIds;
        authorized_repository_ids?: AuthorizedRepositoryIds;
        candidates?: Candidates;
        fallbacks?: Fallbacks;
        outcome: ScopeResolutionOutcome;
        requested_scope: DevScope;
        resolved_at: ResolvedAt;
        resolved_scope?: DevScope | null;
        schema_version: SchemaVersion4;
        warnings?: Warnings;
    }
    export interface DevDisambiguationCandidate {
        entity_ref: DevEntityRef;
        reason: Reason;
        repository_id?: RepositoryId1;
    }
    export interface DevContractVersions {
        metric_definition_version: MetricDefinitionVersion;
        prompt_version: PromptVersion;
        query_version: QueryVersion1;
        tool_contract_version: ToolContractVersion;
    }
}
export type DevAnswer = DevAnswerContract.DevAnswer;
export namespace DevCapabilitiesContract {
    export type AdministratorSafeFailureReason = string | null;
    export type AgentContextRuntime = boolean;
    export type AskDev = boolean;
    export type ByoLlm = boolean;
    export type CanManage = boolean;
    export type CanRead = boolean;
    export type ContextualEntrypoints = boolean;
    export type EffectiveModelLabel = string | null;
    export type EffectiveProviderLabel = string | null;
    export type EvidenceResolver = boolean;
    export type ProviderSource = ("platform" | "byo") | null;
    export type Readiness =
        "ready" | "unsupported_model" | "missing_credentials" | "disabled" | "degraded";
    export type ActiveRunsPerOrganization = number;
    export type ActiveRunsPerUser = number;
    export type ModelDecisionRounds = number;
    export type RequestsPerOrganizationPerHour = number;
    export type RequestsPerUserPer15Minutes = number;
    export type TotalToolCalls = number;
    export type WallSeconds = number;
    /**
     * @minItems 2
     * @maxItems 2
     */
    export type RetentionOptions = [0 | 30, 0 | 30];
    export type SchemaVersion = "dev_capabilities.v1";
    /**
     * @maxItems 20
     */
    export type SupportedContractVersions =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    /**
     * @minItems 1
     * @maxItems 6
     */
    export type SupportedQuestionClasses =
        | [QuestionClass]
        | [QuestionClass, QuestionClass]
        | [QuestionClass, QuestionClass, QuestionClass]
        | [QuestionClass, QuestionClass, QuestionClass, QuestionClass]
        | [QuestionClass, QuestionClass, QuestionClass, QuestionClass, QuestionClass]
        | [
              QuestionClass,
              QuestionClass,
              QuestionClass,
              QuestionClass,
              QuestionClass,
              QuestionClass,
          ];
    export type QuestionClass =
        | "status"
        | "remaining_work"
        | "observed_change"
        | "registered_statistics"
        | "data_trust"
        | "investigation";

    export interface DevCapabilities {
        administrator_safe_failure_reason?: AdministratorSafeFailureReason;
        agent_context_runtime?: AgentContextRuntime;
        ask_dev?: AskDev;
        byo_llm?: ByoLlm;
        can_manage?: CanManage;
        can_read?: CanRead;
        contextual_entrypoints?: ContextualEntrypoints;
        effective_model_label?: EffectiveModelLabel;
        effective_provider_label?: EffectiveProviderLabel;
        evidence_resolver?: EvidenceResolver;
        provider_source?: ProviderSource;
        readiness?: Readiness;
        request_limits?: DevCapabilityLimits;
        retention_options?: RetentionOptions;
        schema_version: SchemaVersion;
        supported_contract_versions?: SupportedContractVersions;
        supported_question_classes?: SupportedQuestionClasses;
    }
    export interface DevCapabilityLimits {
        active_runs_per_organization?: ActiveRunsPerOrganization;
        active_runs_per_user?: ActiveRunsPerUser;
        model_decision_rounds?: ModelDecisionRounds;
        requests_per_organization_per_hour?: RequestsPerOrganizationPerHour;
        requests_per_user_per_15_minutes?: RequestsPerUserPer15Minutes;
        total_tool_calls?: TotalToolCalls;
        wall_seconds?: WallSeconds;
    }
}
export type DevCapabilities = DevCapabilitiesContract.DevCapabilities;
export namespace DevClaimContract {
    export type ClaimId = string;
    export type Confidence = number;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds = string[];
    export type Conflicting = boolean;
    export type Stale = boolean;
    export type Uncertain = boolean;
    export type UntrustedSource = boolean;
    export type ClaimKind = "observed" | "inferred" | "recommendation";
    /**
     * @maxItems 12
     */
    export type MetricRefIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
          ];
    export type RecommendationRuleVersion = string | null;
    export type SchemaVersion = "dev_claim.v1";
    export type Text = string;
    export type End = string;
    export type Start = string;
    export type Timezone = string;
    export type DirectScope =
        "organization" | "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    /**
     * @maxItems 20
     */
    export type EntityRefs =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type DisplayLabel = string;
    export type EntityId = string;
    export type EntityType =
        "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    export type RepositoryId = string | null;
    export type OrganizationId = string;
    /**
     * @maxItems 20
     */
    export type Repositories =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion1 = "dev_scope.v1";
    /**
     * @maxItems 20
     */
    export type EntityRefs1 =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type FilterFingerprint = string | null;
    export type AskDevSurfaceRouteID =
        | "diagnose_overview"
        | "flow_metrics"
        | "investment"
        | "work_graph"
        | "complexity"
        | "cognitive_load"
        | "bottlenecks"
        | "repository_detail"
        | "project_detail"
        | "work_unit_detail"
        | "issue_detail"
        | "pull_request_detail"
        | "data_health";
    /**
     * @maxItems 20
     */
    export type TeamIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];

    export interface DevClaim {
        claim_id: ClaimId;
        confidence: Confidence;
        evidence_ref_ids?: EvidenceRefIds;
        flags: DevClaimFlags;
        kind: ClaimKind;
        metric_ref_ids?: MetricRefIds;
        recommendation_rule_version?: RecommendationRuleVersion;
        schema_version: SchemaVersion;
        text: Text;
        validity_scope: DevScope;
    }
    export interface DevClaimFlags {
        conflicting?: Conflicting;
        stale?: Stale;
        uncertain?: Uncertain;
        untrusted_source?: UntrustedSource;
    }
    export interface DevScope {
        comparison_range?: DevTimeRange | null;
        direct_scope: DirectScope;
        entity_refs?: EntityRefs;
        organization_id: OrganizationId;
        repositories?: Repositories;
        schema_version: SchemaVersion1;
        surface_context?: DevSurfaceContext | null;
        team_ids?: TeamIds;
        time_range: DevTimeRange;
    }
    export interface DevTimeRange {
        end: End;
        start: Start;
        timezone: Timezone;
    }
    export interface DevEntityRef {
        display_label: DisplayLabel;
        entity_id: EntityId;
        entity_type: EntityType;
        repository_id?: RepositoryId;
    }
    export interface DevSurfaceContext {
        entity_refs?: EntityRefs1;
        filter_fingerprint?: FilterFingerprint;
        route_id: AskDevSurfaceRouteID;
    }
}
export type DevClaim = DevClaimContract.DevClaim;
export namespace DevConversationSummaryContract {
    export type ConversationId = string;
    export type DirectScope =
        "organization" | "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    export type ExpiresAt = string | null;
    export type MessageCount = number;
    export type SchemaVersion = "dev_conversation_summary.v1";
    export type State = "active" | "deleted" | "expired";
    export type Title = string | null;
    export type UpdatedAt = string;

    export interface DevConversationSummary {
        conversation_id: ConversationId;
        direct_scope: DirectScope;
        expires_at?: ExpiresAt;
        message_count: MessageCount;
        schema_version: SchemaVersion;
        state: State;
        title?: Title;
        updated_at: UpdatedAt;
    }
}
export type DevConversationSummary = DevConversationSummaryContract.DevConversationSummary;
export namespace DevConversationTranscriptContract {
    export type ConversationId = string;
    export type AnswerId = string;
    export type AsOf = string;
    export type ClaimId = string;
    export type Confidence = number;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds = string[];
    export type Conflicting = boolean;
    export type Stale = boolean;
    export type Uncertain = boolean;
    export type UntrustedSource = boolean;
    export type ClaimKind = "observed" | "inferred" | "recommendation";
    /**
     * @maxItems 12
     */
    export type MetricRefIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
          ];
    export type RecommendationRuleVersion = string | null;
    export type SchemaVersion = "dev_claim.v1";
    export type Text = string;
    export type End = string;
    export type Start = string;
    export type Timezone = string;
    export type DirectScope =
        "organization" | "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    /**
     * @maxItems 20
     */
    export type EntityRefs =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type DisplayLabel = string;
    export type EntityId = string;
    export type EntityType =
        "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    export type RepositoryId = string | null;
    export type OrganizationId = string;
    /**
     * @maxItems 20
     */
    export type Repositories =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion1 = "dev_scope.v1";
    /**
     * @maxItems 20
     */
    export type EntityRefs1 =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type FilterFingerprint = string | null;
    export type AskDevSurfaceRouteID =
        | "diagnose_overview"
        | "flow_metrics"
        | "investment"
        | "work_graph"
        | "complexity"
        | "cognitive_load"
        | "bottlenecks"
        | "repository_detail"
        | "project_detail"
        | "work_unit_detail"
        | "issue_detail"
        | "pull_request_detail"
        | "data_health";
    /**
     * @maxItems 20
     */
    export type TeamIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    /**
     * @maxItems 100
     */
    export type Claims = DevClaim[];
    /**
     * @maxItems 20
     */
    export type Conflicts =
        | []
        | [DevConflict]
        | [DevConflict, DevConflict]
        | [DevConflict, DevConflict, DevConflict]
        | [DevConflict, DevConflict, DevConflict, DevConflict]
        | [DevConflict, DevConflict, DevConflict, DevConflict, DevConflict]
        | [DevConflict, DevConflict, DevConflict, DevConflict, DevConflict, DevConflict]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ];
    /**
     * @minItems 2
     * @maxItems 10
     */
    export type EvidenceRefIds1 =
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string];
    export type Summary = string;
    export type ConversationId1 = string;
    export type AsOf1 = string;
    export type AvailableSourceCount = number;
    /**
     * @maxItems 25
     */
    export type DegradedRequiredSources = string[];
    export type RequiredSourceCount = number;
    /**
     * @maxItems 25
     */
    export type StaleRequiredSources = string[];
    /**
     * @maxItems 25
     */
    export type UnavailableRequiredSources = string[];
    export type DirectSummary = string;
    export type CitationText = string | null;
    export type Confidence1 = number;
    export type DisplayLabel1 = string;
    export type EntityId1 = string;
    export type EntityType1 = string;
    export type EvidenceRefId = string;
    export type Conflicting1 = boolean;
    export type Deleted = boolean;
    export type Redacted = boolean;
    export type Stale1 = boolean;
    export type Unavailable = boolean;
    export type Uncertain1 = boolean;
    export type UntrustedContent = boolean;
    export type FreshnessState = "fresh" | "stale" | "unavailable" | "unknown";
    export type InternalPath = string | null;
    export type SourceUrl = string | null;
    export type ObservedAt = string;
    export type Provenance = string;
    /**
     * @maxItems 20
     */
    export type RepositoryIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion2 = "dev_evidence_ref.v1";
    export type SourceSystem = string;
    export type SourceVersion = string;
    /**
     * @maxItems 20
     */
    export type ValidEntityIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    /**
     * @maxItems 25
     */
    export type Evidence = DevEvidenceRef[];
    export type GeneratedAt = string;
    /**
     * @maxItems 12
     */
    export type Metrics =
        | []
        | [DevMetricRef]
        | [DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ];
    export type Aggregation = string;
    export type ComparisonValue = number | null;
    export type Coverage = number;
    export type DefinitionVersion = string;
    /**
     * @maxItems 12
     */
    export type Dimensions =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
          ];
    export type DisplayPrecision = number;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds2 = string[];
    export type Label = string;
    export type MetricID =
        | "items_completed"
        | "cycle_time_p50_hours"
        | "avg_wip"
        | "deployments_count"
        | "change_failure_rate"
        | "investment_allocation_pct"
        | "cyclomatic_per_kloc"
        | "compounding_risk_score";
    export type MetricRefId = string;
    export type QueryVersion = string;
    export type SchemaVersion3 = "dev_metric_ref.v1";
    export type Timestamp = string;
    export type Value = number;
    /**
     * @maxItems 366
     */
    export type Series = DevMetricPoint[];
    export type SourceVersion1 = string;
    export type Unit = string;
    export type Value1 = number | null;
    export type ModelFingerprint = string;
    export type ProviderFamily = string;
    export type ProviderSource = "platform" | "byo";
    /**
     * @maxItems 20
     */
    export type AuthorizedEntityIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    /**
     * @maxItems 20
     */
    export type AuthorizedRepositoryIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type Reason = string;
    export type RepositoryId1 = string | null;
    /**
     * @maxItems 25
     */
    export type Candidates = DevDisambiguationCandidate[];
    /**
     * @maxItems 10
     */
    export type Fallbacks =
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string];
    export type ScopeResolutionOutcome =
        | "exact"
        | "filtered"
        | "inherited"
        | "organization_fallback"
        | "ambiguous"
        | "unresolved"
        | "forbidden_or_not_found";
    export type ResolvedAt = string;
    export type SchemaVersion4 = "dev_scope_resolution.v1";
    /**
     * @maxItems 20
     */
    export type Warnings =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion5 = "dev_answer.v1";
    export type AnswerStatus =
        "complete" | "partial" | "degraded" | "insufficient_evidence" | "refused" | "error";
    /**
     * @maxItems 10
     */
    export type SuggestedFollowUpQuestions =
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string];
    export type MetricDefinitionVersion = string;
    export type PromptVersion = string;
    export type QueryVersion1 = string;
    export type ToolContractVersion = string;
    /**
     * @maxItems 20
     */
    export type Warnings1 =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type CreatedAt = string;
    export type MessageId = string;
    export type Question = string | null;
    export type RetryOfRunId = string | null;
    export type Role = "user" | "assistant";
    export type RunId = string;
    export type RunState =
        | "accepted"
        | "resolving_scope"
        | "interpreting"
        | "resolving_subjects"
        | "model_decision"
        | "tool_validation"
        | "tool_execution"
        | "answer_validation"
        | "completed"
        | "insufficient_evidence"
        | "refused"
        | "failed"
        | "cancelled";
    export type SchemaVersion6 = "dev_transcript_entry.v1";
    /**
     * @maxItems 100
     */
    export type Items = DevTranscriptEntry[];
    export type NextCursor = string | null;
    export type SchemaVersion7 = "dev_conversation_transcript.v1";

    /**
     * A bounded page from one retained, owned canonical conversation.
     */
    export interface DevConversationTranscript {
        conversation_id: ConversationId;
        items?: Items;
        next_cursor?: NextCursor;
        schema_version: SchemaVersion7;
    }
    /**
     * One safe persisted turn artifact in the canonical conversation history.
     */
    export interface DevTranscriptEntry {
        answer?: DevAnswer | null;
        created_at: CreatedAt;
        message_id: MessageId;
        question?: Question;
        retry_of_run_id?: RetryOfRunId;
        role: Role;
        run_id: RunId;
        run_state: RunState;
        schema_version: SchemaVersion6;
        scope?: DevScope | null;
    }
    export interface DevAnswer {
        answer_id: AnswerId;
        as_of: AsOf;
        claims?: Claims;
        conflicts?: Conflicts;
        conversation_id: ConversationId1;
        coverage: DevCoverage;
        direct_summary: DirectSummary;
        evidence?: Evidence;
        generated_at: GeneratedAt;
        metrics?: Metrics;
        model: DevModelMetadata;
        resolved_scope: DevScopeResolution;
        schema_version: SchemaVersion5;
        status: AnswerStatus;
        suggested_follow_up_questions?: SuggestedFollowUpQuestions;
        versions: DevContractVersions;
        warnings?: Warnings1;
    }
    export interface DevClaim {
        claim_id: ClaimId;
        confidence: Confidence;
        evidence_ref_ids?: EvidenceRefIds;
        flags: DevClaimFlags;
        kind: ClaimKind;
        metric_ref_ids?: MetricRefIds;
        recommendation_rule_version?: RecommendationRuleVersion;
        schema_version: SchemaVersion;
        text: Text;
        validity_scope: DevScope;
    }
    export interface DevClaimFlags {
        conflicting?: Conflicting;
        stale?: Stale;
        uncertain?: Uncertain;
        untrusted_source?: UntrustedSource;
    }
    export interface DevScope {
        comparison_range?: DevTimeRange | null;
        direct_scope: DirectScope;
        entity_refs?: EntityRefs;
        organization_id: OrganizationId;
        repositories?: Repositories;
        schema_version: SchemaVersion1;
        surface_context?: DevSurfaceContext | null;
        team_ids?: TeamIds;
        time_range: DevTimeRange;
    }
    export interface DevTimeRange {
        end: End;
        start: Start;
        timezone: Timezone;
    }
    export interface DevEntityRef {
        display_label: DisplayLabel;
        entity_id: EntityId;
        entity_type: EntityType;
        repository_id?: RepositoryId;
    }
    export interface DevSurfaceContext {
        entity_refs?: EntityRefs1;
        filter_fingerprint?: FilterFingerprint;
        route_id: AskDevSurfaceRouteID;
    }
    export interface DevConflict {
        evidence_ref_ids: EvidenceRefIds1;
        summary: Summary;
    }
    export interface DevCoverage {
        as_of: AsOf1;
        available_source_count: AvailableSourceCount;
        degraded_required_sources?: DegradedRequiredSources;
        required_source_count: RequiredSourceCount;
        stale_required_sources?: StaleRequiredSources;
        unavailable_required_sources?: UnavailableRequiredSources;
    }
    export interface DevEvidenceRef {
        citation_text?: CitationText;
        confidence: Confidence1;
        display_label: DisplayLabel1;
        entity_id: EntityId1;
        entity_type: EntityType1;
        evidence_ref_id: EvidenceRefId;
        flags: DevEvidenceFlags;
        freshness: FreshnessState;
        link?: DevCitationLink | null;
        observed_at: ObservedAt;
        provenance: Provenance;
        repository_ids?: RepositoryIds;
        schema_version: SchemaVersion2;
        source_system: SourceSystem;
        source_version: SourceVersion;
        valid_entity_ids?: ValidEntityIds;
    }
    export interface DevEvidenceFlags {
        conflicting?: Conflicting1;
        deleted?: Deleted;
        redacted?: Redacted;
        stale?: Stale1;
        unavailable?: Unavailable;
        uncertain?: Uncertain1;
        untrusted_content?: UntrustedContent;
    }
    export interface DevCitationLink {
        internal_path?: InternalPath;
        source_url?: SourceUrl;
    }
    export interface DevMetricRef {
        aggregation: Aggregation;
        comparison_value?: ComparisonValue;
        comparison_window?: DevTimeRange | null;
        coverage: Coverage;
        current_window: DevTimeRange;
        definition_version: DefinitionVersion;
        dimensions?: Dimensions;
        display_precision: DisplayPrecision;
        evidence_ref_ids?: EvidenceRefIds2;
        freshness: FreshnessState;
        label: Label;
        metric_id: MetricID;
        metric_ref_id: MetricRefId;
        query_version: QueryVersion;
        resolved_scope: DevScope;
        schema_version: SchemaVersion3;
        series?: Series;
        source_version: SourceVersion1;
        unit: Unit;
        value?: Value1;
    }
    export interface DevMetricPoint {
        timestamp: Timestamp;
        value: Value;
    }
    export interface DevModelMetadata {
        model_fingerprint: ModelFingerprint;
        provider_family: ProviderFamily;
        provider_source: ProviderSource;
    }
    export interface DevScopeResolution {
        authorized_entity_ids?: AuthorizedEntityIds;
        authorized_repository_ids?: AuthorizedRepositoryIds;
        candidates?: Candidates;
        fallbacks?: Fallbacks;
        outcome: ScopeResolutionOutcome;
        requested_scope: DevScope;
        resolved_at: ResolvedAt;
        resolved_scope?: DevScope | null;
        schema_version: SchemaVersion4;
        warnings?: Warnings;
    }
    export interface DevDisambiguationCandidate {
        entity_ref: DevEntityRef;
        reason: Reason;
        repository_id?: RepositoryId1;
    }
    export interface DevContractVersions {
        metric_definition_version: MetricDefinitionVersion;
        prompt_version: PromptVersion;
        query_version: QueryVersion1;
        tool_contract_version: ToolContractVersion;
    }
}
export type DevConversationTranscript = DevConversationTranscriptContract.DevConversationTranscript;
export namespace DevConversationContract {
    export type ConversationId = string;
    export type CreatedAt = string;
    export type End = string;
    export type Start = string;
    export type Timezone = string;
    export type DirectScope =
        "organization" | "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    /**
     * @maxItems 20
     */
    export type EntityRefs =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type DisplayLabel = string;
    export type EntityId = string;
    export type EntityType =
        "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    export type RepositoryId = string | null;
    export type OrganizationId = string;
    /**
     * @maxItems 20
     */
    export type Repositories =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion = "dev_scope.v1";
    /**
     * @maxItems 20
     */
    export type EntityRefs1 =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type FilterFingerprint = string | null;
    export type AskDevSurfaceRouteID =
        | "diagnose_overview"
        | "flow_metrics"
        | "investment"
        | "work_graph"
        | "complexity"
        | "cognitive_load"
        | "bottlenecks"
        | "repository_detail"
        | "project_detail"
        | "work_unit_detail"
        | "issue_detail"
        | "pull_request_detail"
        | "data_health";
    /**
     * @maxItems 20
     */
    export type TeamIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type ExpiresAt = string | null;
    export type LatestAnswerId = string | null;
    export type MessageCount = number;
    export type RetentionDays = 0 | 30;
    export type SchemaVersion1 = "dev_conversation.v1";
    export type State = "active" | "deleted" | "expired";
    export type Title = string | null;
    export type UpdatedAt = string;

    export interface DevConversation {
        conversation_id: ConversationId;
        created_at: CreatedAt;
        current_scope: DevScope;
        expires_at?: ExpiresAt;
        latest_answer_id?: LatestAnswerId;
        message_count: MessageCount;
        retention_days: RetentionDays;
        schema_version: SchemaVersion1;
        state: State;
        title?: Title;
        updated_at: UpdatedAt;
    }
    export interface DevScope {
        comparison_range?: DevTimeRange | null;
        direct_scope: DirectScope;
        entity_refs?: EntityRefs;
        organization_id: OrganizationId;
        repositories?: Repositories;
        schema_version: SchemaVersion;
        surface_context?: DevSurfaceContext | null;
        team_ids?: TeamIds;
        time_range: DevTimeRange;
    }
    export interface DevTimeRange {
        end: End;
        start: Start;
        timezone: Timezone;
    }
    export interface DevEntityRef {
        display_label: DisplayLabel;
        entity_id: EntityId;
        entity_type: EntityType;
        repository_id?: RepositoryId;
    }
    export interface DevSurfaceContext {
        entity_refs?: EntityRefs1;
        filter_fingerprint?: FilterFingerprint;
        route_id: AskDevSurfaceRouteID;
    }
}
export type DevConversation = DevConversationContract.DevConversation;
export namespace DevErrorContract {
    export type Code =
        | "unauthenticated"
        | "forbidden"
        | "feature_not_enabled"
        | "byo_llm_not_enabled"
        | "provider_not_configured"
        | "model_not_supported"
        | "provider_unavailable"
        | "rate_limited"
        | "concurrency_limited"
        | "cost_limit_reached"
        | "invalid_request"
        | "scope_ambiguous"
        | "scope_not_found"
        | "scope_forbidden"
        | "conversation_not_found"
        | "conversation_expired"
        | "tool_limit_reached"
        | "tool_unavailable"
        | "source_unavailable"
        | "insufficient_evidence"
        | "answer_validation_failed"
        | "cancelled"
        | "provider_contract_violation"
        | "internal_error"
        | "refused";
    export type LimitResetAt = string | null;
    /**
     * @maxItems 5
     */
    export type Remediation =
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string];
    export type RequestId = string;
    export type Retryable = boolean;
    export type SafeMessage = string;
    export type SchemaVersion = "dev_error.v1";

    export interface DevError {
        code: Code;
        limit_reset_at?: LimitResetAt;
        remediation?: Remediation;
        request_id: RequestId;
        retryable: Retryable;
        safe_message: SafeMessage;
        schema_version: SchemaVersion;
    }
}
export type DevError = DevErrorContract.DevError;
export namespace DevEvidenceExpansionContract {
    export type CitationText = string | null;
    export type Confidence = number;
    export type DisplayLabel = string;
    export type EntityId = string;
    export type EntityType = string;
    export type EvidenceRefId = string;
    export type Conflicting = boolean;
    export type Deleted = boolean;
    export type Redacted = boolean;
    export type Stale = boolean;
    export type Unavailable = boolean;
    export type Uncertain = boolean;
    export type UntrustedContent = boolean;
    export type FreshnessState = "fresh" | "stale" | "unavailable" | "unknown";
    export type InternalPath = string | null;
    export type SourceUrl = string | null;
    export type ObservedAt = string;
    export type Provenance = string;
    /**
     * @maxItems 20
     */
    export type RepositoryIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion = "dev_evidence_ref.v1";
    export type SourceSystem = string;
    export type SourceVersion = string;
    /**
     * @maxItems 20
     */
    export type ValidEntityIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type QueryVersion = string;
    export type SafeExcerpt = string | null;
    export type SchemaVersion1 = "dev_evidence_expansion.v1";
    export type SerializedBytes = number;
    export type State =
        "available" | "no_matches" | "unavailable" | "unconfigured" | "redacted" | "stale";
    export type Warning = string | null;

    export interface DevEvidenceExpansion {
        evidence: DevEvidenceRef;
        query_version: QueryVersion;
        safe_excerpt?: SafeExcerpt;
        schema_version: SchemaVersion1;
        serialized_bytes: SerializedBytes;
        state: State;
        warning?: Warning;
    }
    export interface DevEvidenceRef {
        citation_text?: CitationText;
        confidence: Confidence;
        display_label: DisplayLabel;
        entity_id: EntityId;
        entity_type: EntityType;
        evidence_ref_id: EvidenceRefId;
        flags: DevEvidenceFlags;
        freshness: FreshnessState;
        link?: DevCitationLink | null;
        observed_at: ObservedAt;
        provenance: Provenance;
        repository_ids?: RepositoryIds;
        schema_version: SchemaVersion;
        source_system: SourceSystem;
        source_version: SourceVersion;
        valid_entity_ids?: ValidEntityIds;
    }
    export interface DevEvidenceFlags {
        conflicting?: Conflicting;
        deleted?: Deleted;
        redacted?: Redacted;
        stale?: Stale;
        unavailable?: Unavailable;
        uncertain?: Uncertain;
        untrusted_content?: UntrustedContent;
    }
    export interface DevCitationLink {
        internal_path?: InternalPath;
        source_url?: SourceUrl;
    }
}
export type DevEvidenceExpansion = DevEvidenceExpansionContract.DevEvidenceExpansion;
export namespace DevEvidenceRefContract {
    export type CitationText = string | null;
    export type Confidence = number;
    export type DisplayLabel = string;
    export type EntityId = string;
    export type EntityType = string;
    export type EvidenceRefId = string;
    export type Conflicting = boolean;
    export type Deleted = boolean;
    export type Redacted = boolean;
    export type Stale = boolean;
    export type Unavailable = boolean;
    export type Uncertain = boolean;
    export type UntrustedContent = boolean;
    export type FreshnessState = "fresh" | "stale" | "unavailable" | "unknown";
    export type InternalPath = string | null;
    export type SourceUrl = string | null;
    export type ObservedAt = string;
    export type Provenance = string;
    /**
     * @maxItems 20
     */
    export type RepositoryIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion = "dev_evidence_ref.v1";
    export type SourceSystem = string;
    export type SourceVersion = string;
    /**
     * @maxItems 20
     */
    export type ValidEntityIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];

    export interface DevEvidenceRef {
        citation_text?: CitationText;
        confidence: Confidence;
        display_label: DisplayLabel;
        entity_id: EntityId;
        entity_type: EntityType;
        evidence_ref_id: EvidenceRefId;
        flags: DevEvidenceFlags;
        freshness: FreshnessState;
        link?: DevCitationLink | null;
        observed_at: ObservedAt;
        provenance: Provenance;
        repository_ids?: RepositoryIds;
        schema_version: SchemaVersion;
        source_system: SourceSystem;
        source_version: SourceVersion;
        valid_entity_ids?: ValidEntityIds;
    }
    export interface DevEvidenceFlags {
        conflicting?: Conflicting;
        deleted?: Deleted;
        redacted?: Redacted;
        stale?: Stale;
        unavailable?: Unavailable;
        uncertain?: Uncertain;
        untrusted_content?: UntrustedContent;
    }
    export interface DevCitationLink {
        internal_path?: InternalPath;
        source_url?: SourceUrl;
    }
}
export type DevEvidenceRef = DevEvidenceRefContract.DevEvidenceRef;
export namespace DevFeedbackContract {
    export type AnswerId = string;
    export type Comment = string | null;
    export type CreatedAt = string;
    export type FeedbackId = string;
    export type Rating = "helpful" | "not_helpful";
    /**
     * @minItems 1
     * @maxItems 6
     */
    export type Reasons =
        | ["incorrect" | "missing_evidence" | "wrong_scope" | "stale_data" | "unclear" | "useful"]
        | [
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
          ]
        | [
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
          ]
        | [
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
          ]
        | [
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
          ]
        | [
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
              (
                  | "incorrect"
                  | "missing_evidence"
                  | "wrong_scope"
                  | "stale_data"
                  | "unclear"
                  | "useful"
              ),
          ];
    export type SchemaVersion = "dev_feedback.v1";

    export interface DevFeedback {
        answer_id: AnswerId;
        comment?: Comment;
        created_at: CreatedAt;
        feedback_id: FeedbackId;
        rating: Rating;
        reasons: Reasons;
        schema_version: SchemaVersion;
    }
}
export type DevFeedback = DevFeedbackContract.DevFeedback;
export namespace DevMessageRequestContract {
    export type ClientMessageId = string;
    export type ConversationId = string | null;
    export type Question = string;
    export type QuestionClass =
        | "status"
        | "remaining_work"
        | "observed_change"
        | "registered_statistics"
        | "data_trust"
        | "investigation";
    export type RequestId = string;
    /**
     * @maxItems 8
     */
    export type RequestedMetricIds =
        | []
        | [MetricID]
        | [MetricID, MetricID]
        | [MetricID, MetricID, MetricID]
        | [MetricID, MetricID, MetricID, MetricID]
        | [MetricID, MetricID, MetricID, MetricID, MetricID]
        | [MetricID, MetricID, MetricID, MetricID, MetricID, MetricID]
        | [MetricID, MetricID, MetricID, MetricID, MetricID, MetricID, MetricID]
        | [MetricID, MetricID, MetricID, MetricID, MetricID, MetricID, MetricID, MetricID];
    export type MetricID =
        | "items_completed"
        | "cycle_time_p50_hours"
        | "avg_wip"
        | "deployments_count"
        | "change_failure_rate"
        | "investment_allocation_pct"
        | "cyclomatic_per_kloc"
        | "compounding_risk_score";
    export type RetryOfRunId = string | null;
    export type SchemaVersion = "dev_message_request.v1";
    export type End = string;
    export type Start = string;
    export type Timezone = string;
    export type DirectScope =
        "organization" | "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    /**
     * @maxItems 20
     */
    export type EntityRefs =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type DisplayLabel = string;
    export type EntityId = string;
    export type EntityType =
        "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    export type RepositoryId = string | null;
    export type OrganizationId = string;
    /**
     * @maxItems 20
     */
    export type Repositories =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion1 = "dev_scope.v1";
    /**
     * @maxItems 20
     */
    export type EntityRefs1 =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type FilterFingerprint = string | null;
    export type AskDevSurfaceRouteID =
        | "diagnose_overview"
        | "flow_metrics"
        | "investment"
        | "work_graph"
        | "complexity"
        | "cognitive_load"
        | "bottlenecks"
        | "repository_detail"
        | "project_detail"
        | "work_unit_detail"
        | "issue_detail"
        | "pull_request_detail"
        | "data_health";
    /**
     * @maxItems 20
     */
    export type TeamIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];

    export interface DevMessageRequest {
        client_message_id: ClientMessageId;
        conversation_id?: ConversationId;
        question: Question;
        question_class: QuestionClass;
        request_id: RequestId;
        requested_metric_ids?: RequestedMetricIds;
        retry_of_run_id?: RetryOfRunId;
        schema_version: SchemaVersion;
        scope: DevScope;
    }
    export interface DevScope {
        comparison_range?: DevTimeRange | null;
        direct_scope: DirectScope;
        entity_refs?: EntityRefs;
        organization_id: OrganizationId;
        repositories?: Repositories;
        schema_version: SchemaVersion1;
        surface_context?: DevSurfaceContext | null;
        team_ids?: TeamIds;
        time_range: DevTimeRange;
    }
    export interface DevTimeRange {
        end: End;
        start: Start;
        timezone: Timezone;
    }
    export interface DevEntityRef {
        display_label: DisplayLabel;
        entity_id: EntityId;
        entity_type: EntityType;
        repository_id?: RepositoryId;
    }
    export interface DevSurfaceContext {
        entity_refs?: EntityRefs1;
        filter_fingerprint?: FilterFingerprint;
        route_id: AskDevSurfaceRouteID;
    }
}
export type DevMessageRequest = DevMessageRequestContract.DevMessageRequest;
export namespace DevMetricRefContract {
    export type Aggregation = string;
    export type ComparisonValue = number | null;
    export type End = string;
    export type Start = string;
    export type Timezone = string;
    export type Coverage = number;
    export type DefinitionVersion = string;
    /**
     * @maxItems 12
     */
    export type Dimensions =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
          ];
    export type DisplayPrecision = number;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds = string[];
    export type FreshnessState = "fresh" | "stale" | "unavailable" | "unknown";
    export type Label = string;
    export type MetricID =
        | "items_completed"
        | "cycle_time_p50_hours"
        | "avg_wip"
        | "deployments_count"
        | "change_failure_rate"
        | "investment_allocation_pct"
        | "cyclomatic_per_kloc"
        | "compounding_risk_score";
    export type MetricRefId = string;
    export type QueryVersion = string;
    export type DirectScope =
        "organization" | "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    /**
     * @maxItems 20
     */
    export type EntityRefs =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type DisplayLabel = string;
    export type EntityId = string;
    export type EntityType =
        "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    export type RepositoryId = string | null;
    export type OrganizationId = string;
    /**
     * @maxItems 20
     */
    export type Repositories =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion = "dev_scope.v1";
    /**
     * @maxItems 20
     */
    export type EntityRefs1 =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type FilterFingerprint = string | null;
    export type AskDevSurfaceRouteID =
        | "diagnose_overview"
        | "flow_metrics"
        | "investment"
        | "work_graph"
        | "complexity"
        | "cognitive_load"
        | "bottlenecks"
        | "repository_detail"
        | "project_detail"
        | "work_unit_detail"
        | "issue_detail"
        | "pull_request_detail"
        | "data_health";
    /**
     * @maxItems 20
     */
    export type TeamIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion1 = "dev_metric_ref.v1";
    export type Timestamp = string;
    export type Value = number;
    /**
     * @maxItems 366
     */
    export type Series = DevMetricPoint[];
    export type SourceVersion = string;
    export type Unit = string;
    export type Value1 = number | null;

    export interface DevMetricRef {
        aggregation: Aggregation;
        comparison_value?: ComparisonValue;
        comparison_window?: DevTimeRange | null;
        coverage: Coverage;
        current_window: DevTimeRange;
        definition_version: DefinitionVersion;
        dimensions?: Dimensions;
        display_precision: DisplayPrecision;
        evidence_ref_ids?: EvidenceRefIds;
        freshness: FreshnessState;
        label: Label;
        metric_id: MetricID;
        metric_ref_id: MetricRefId;
        query_version: QueryVersion;
        resolved_scope: DevScope;
        schema_version: SchemaVersion1;
        series?: Series;
        source_version: SourceVersion;
        unit: Unit;
        value?: Value1;
    }
    export interface DevTimeRange {
        end: End;
        start: Start;
        timezone: Timezone;
    }
    export interface DevScope {
        comparison_range?: DevTimeRange | null;
        direct_scope: DirectScope;
        entity_refs?: EntityRefs;
        organization_id: OrganizationId;
        repositories?: Repositories;
        schema_version: SchemaVersion;
        surface_context?: DevSurfaceContext | null;
        team_ids?: TeamIds;
        time_range: DevTimeRange;
    }
    export interface DevEntityRef {
        display_label: DisplayLabel;
        entity_id: EntityId;
        entity_type: EntityType;
        repository_id?: RepositoryId;
    }
    export interface DevSurfaceContext {
        entity_refs?: EntityRefs1;
        filter_fingerprint?: FilterFingerprint;
        route_id: AskDevSurfaceRouteID;
    }
    export interface DevMetricPoint {
        timestamp: Timestamp;
        value: Value;
    }
}
export type DevMetricRef = DevMetricRefContract.DevMetricRef;
export namespace DevScopeResolutionContract {
    /**
     * @maxItems 20
     */
    export type AuthorizedEntityIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    /**
     * @maxItems 20
     */
    export type AuthorizedRepositoryIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type DisplayLabel = string;
    export type EntityId = string;
    export type EntityType =
        "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    export type RepositoryId = string | null;
    export type Reason = string;
    export type RepositoryId1 = string | null;
    /**
     * @maxItems 25
     */
    export type Candidates = DevDisambiguationCandidate[];
    /**
     * @maxItems 10
     */
    export type Fallbacks =
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string];
    export type ScopeResolutionOutcome =
        | "exact"
        | "filtered"
        | "inherited"
        | "organization_fallback"
        | "ambiguous"
        | "unresolved"
        | "forbidden_or_not_found";
    export type End = string;
    export type Start = string;
    export type Timezone = string;
    export type DirectScope =
        "organization" | "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    /**
     * @maxItems 20
     */
    export type EntityRefs =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type OrganizationId = string;
    /**
     * @maxItems 20
     */
    export type Repositories =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion = "dev_scope.v1";
    /**
     * @maxItems 20
     */
    export type EntityRefs1 =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type FilterFingerprint = string | null;
    export type AskDevSurfaceRouteID =
        | "diagnose_overview"
        | "flow_metrics"
        | "investment"
        | "work_graph"
        | "complexity"
        | "cognitive_load"
        | "bottlenecks"
        | "repository_detail"
        | "project_detail"
        | "work_unit_detail"
        | "issue_detail"
        | "pull_request_detail"
        | "data_health";
    /**
     * @maxItems 20
     */
    export type TeamIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type ResolvedAt = string;
    export type SchemaVersion1 = "dev_scope_resolution.v1";
    /**
     * @maxItems 20
     */
    export type Warnings =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];

    export interface DevScopeResolution {
        authorized_entity_ids?: AuthorizedEntityIds;
        authorized_repository_ids?: AuthorizedRepositoryIds;
        candidates?: Candidates;
        fallbacks?: Fallbacks;
        outcome: ScopeResolutionOutcome;
        requested_scope: DevScope;
        resolved_at: ResolvedAt;
        resolved_scope?: DevScope | null;
        schema_version: SchemaVersion1;
        warnings?: Warnings;
    }
    export interface DevDisambiguationCandidate {
        entity_ref: DevEntityRef;
        reason: Reason;
        repository_id?: RepositoryId1;
    }
    export interface DevEntityRef {
        display_label: DisplayLabel;
        entity_id: EntityId;
        entity_type: EntityType;
        repository_id?: RepositoryId;
    }
    export interface DevScope {
        comparison_range?: DevTimeRange | null;
        direct_scope: DirectScope;
        entity_refs?: EntityRefs;
        organization_id: OrganizationId;
        repositories?: Repositories;
        schema_version: SchemaVersion;
        surface_context?: DevSurfaceContext | null;
        team_ids?: TeamIds;
        time_range: DevTimeRange;
    }
    export interface DevTimeRange {
        end: End;
        start: Start;
        timezone: Timezone;
    }
    export interface DevSurfaceContext {
        entity_refs?: EntityRefs1;
        filter_fingerprint?: FilterFingerprint;
        route_id: AskDevSurfaceRouteID;
    }
}
export type DevScopeResolution = DevScopeResolutionContract.DevScopeResolution;
export namespace DevScopeContract {
    export type End = string;
    export type Start = string;
    export type Timezone = string;
    export type DirectScope =
        "organization" | "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    /**
     * @maxItems 20
     */
    export type EntityRefs =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type DisplayLabel = string;
    export type EntityId = string;
    export type EntityType =
        "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    export type RepositoryId = string | null;
    export type OrganizationId = string;
    /**
     * @maxItems 20
     */
    export type Repositories =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion = "dev_scope.v1";
    /**
     * @maxItems 20
     */
    export type EntityRefs1 =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type FilterFingerprint = string | null;
    export type AskDevSurfaceRouteID =
        | "diagnose_overview"
        | "flow_metrics"
        | "investment"
        | "work_graph"
        | "complexity"
        | "cognitive_load"
        | "bottlenecks"
        | "repository_detail"
        | "project_detail"
        | "work_unit_detail"
        | "issue_detail"
        | "pull_request_detail"
        | "data_health";
    /**
     * @maxItems 20
     */
    export type TeamIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];

    export interface DevScope {
        comparison_range?: DevTimeRange | null;
        direct_scope: DirectScope;
        entity_refs?: EntityRefs;
        organization_id: OrganizationId;
        repositories?: Repositories;
        schema_version: SchemaVersion;
        surface_context?: DevSurfaceContext | null;
        team_ids?: TeamIds;
        time_range: DevTimeRange;
    }
    export interface DevTimeRange {
        end: End;
        start: Start;
        timezone: Timezone;
    }
    export interface DevEntityRef {
        display_label: DisplayLabel;
        entity_id: EntityId;
        entity_type: EntityType;
        repository_id?: RepositoryId;
    }
    export interface DevSurfaceContext {
        entity_refs?: EntityRefs1;
        filter_fingerprint?: FilterFingerprint;
        route_id: AskDevSurfaceRouteID;
    }
}
export type DevScope = DevScopeContract.DevScope;
export namespace DevStreamEventContract {
    export type AnswerId = string;
    export type AsOf = string;
    export type ClaimId = string;
    export type Confidence = number;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds = string[];
    export type Conflicting = boolean;
    export type Stale = boolean;
    export type Uncertain = boolean;
    export type UntrustedSource = boolean;
    export type ClaimKind = "observed" | "inferred" | "recommendation";
    /**
     * @maxItems 12
     */
    export type MetricRefIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
          ];
    export type RecommendationRuleVersion = string | null;
    export type SchemaVersion = "dev_claim.v1";
    export type Text = string;
    export type End = string;
    export type Start = string;
    export type Timezone = string;
    export type DirectScope =
        "organization" | "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    /**
     * @maxItems 20
     */
    export type EntityRefs =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type DisplayLabel = string;
    export type EntityId = string;
    export type EntityType =
        "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    export type RepositoryId = string | null;
    export type OrganizationId = string;
    /**
     * @maxItems 20
     */
    export type Repositories =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion1 = "dev_scope.v1";
    /**
     * @maxItems 20
     */
    export type EntityRefs1 =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type FilterFingerprint = string | null;
    export type AskDevSurfaceRouteID =
        | "diagnose_overview"
        | "flow_metrics"
        | "investment"
        | "work_graph"
        | "complexity"
        | "cognitive_load"
        | "bottlenecks"
        | "repository_detail"
        | "project_detail"
        | "work_unit_detail"
        | "issue_detail"
        | "pull_request_detail"
        | "data_health";
    /**
     * @maxItems 20
     */
    export type TeamIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    /**
     * @maxItems 100
     */
    export type Claims = DevClaim[];
    /**
     * @maxItems 20
     */
    export type Conflicts =
        | []
        | [DevConflict]
        | [DevConflict, DevConflict]
        | [DevConflict, DevConflict, DevConflict]
        | [DevConflict, DevConflict, DevConflict, DevConflict]
        | [DevConflict, DevConflict, DevConflict, DevConflict, DevConflict]
        | [DevConflict, DevConflict, DevConflict, DevConflict, DevConflict, DevConflict]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ]
        | [
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
              DevConflict,
          ];
    /**
     * @minItems 2
     * @maxItems 10
     */
    export type EvidenceRefIds1 =
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string];
    export type Summary = string;
    export type ConversationId = string;
    export type AsOf1 = string;
    export type AvailableSourceCount = number;
    /**
     * @maxItems 25
     */
    export type DegradedRequiredSources = string[];
    export type RequiredSourceCount = number;
    /**
     * @maxItems 25
     */
    export type StaleRequiredSources = string[];
    /**
     * @maxItems 25
     */
    export type UnavailableRequiredSources = string[];
    export type DirectSummary = string;
    export type CitationText = string | null;
    export type Confidence1 = number;
    export type DisplayLabel1 = string;
    export type EntityId1 = string;
    export type EntityType1 = string;
    export type EvidenceRefId = string;
    export type Conflicting1 = boolean;
    export type Deleted = boolean;
    export type Redacted = boolean;
    export type Stale1 = boolean;
    export type Unavailable = boolean;
    export type Uncertain1 = boolean;
    export type UntrustedContent = boolean;
    export type FreshnessState = "fresh" | "stale" | "unavailable" | "unknown";
    export type InternalPath = string | null;
    export type SourceUrl = string | null;
    export type ObservedAt = string;
    export type Provenance = string;
    /**
     * @maxItems 20
     */
    export type RepositoryIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion2 = "dev_evidence_ref.v1";
    export type SourceSystem = string;
    export type SourceVersion = string;
    /**
     * @maxItems 20
     */
    export type ValidEntityIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    /**
     * @maxItems 25
     */
    export type Evidence = DevEvidenceRef[];
    export type GeneratedAt = string;
    /**
     * @maxItems 12
     */
    export type Metrics =
        | []
        | [DevMetricRef]
        | [DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ];
    export type Aggregation = string;
    export type ComparisonValue = number | null;
    export type Coverage = number;
    export type DefinitionVersion = string;
    /**
     * @maxItems 12
     */
    export type Dimensions =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
          ];
    export type DisplayPrecision = number;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds2 = string[];
    export type Label = string;
    export type MetricID =
        | "items_completed"
        | "cycle_time_p50_hours"
        | "avg_wip"
        | "deployments_count"
        | "change_failure_rate"
        | "investment_allocation_pct"
        | "cyclomatic_per_kloc"
        | "compounding_risk_score";
    export type MetricRefId = string;
    export type QueryVersion = string;
    export type SchemaVersion3 = "dev_metric_ref.v1";
    export type Timestamp = string;
    export type Value = number;
    /**
     * @maxItems 366
     */
    export type Series = DevMetricPoint[];
    export type SourceVersion1 = string;
    export type Unit = string;
    export type Value1 = number | null;
    export type ModelFingerprint = string;
    export type ProviderFamily = string;
    export type ProviderSource = "platform" | "byo";
    /**
     * @maxItems 20
     */
    export type AuthorizedEntityIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    /**
     * @maxItems 20
     */
    export type AuthorizedRepositoryIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type Reason = string;
    export type RepositoryId1 = string | null;
    /**
     * @maxItems 25
     */
    export type Candidates = DevDisambiguationCandidate[];
    /**
     * @maxItems 10
     */
    export type Fallbacks =
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string];
    export type ScopeResolutionOutcome =
        | "exact"
        | "filtered"
        | "inherited"
        | "organization_fallback"
        | "ambiguous"
        | "unresolved"
        | "forbidden_or_not_found";
    export type ResolvedAt = string;
    export type SchemaVersion4 = "dev_scope_resolution.v1";
    /**
     * @maxItems 20
     */
    export type Warnings =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion5 = "dev_answer.v1";
    export type AnswerStatus =
        "complete" | "partial" | "degraded" | "insufficient_evidence" | "refused" | "error";
    /**
     * @maxItems 10
     */
    export type SuggestedFollowUpQuestions =
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string];
    export type MetricDefinitionVersion = string;
    export type PromptVersion = string;
    export type QueryVersion1 = string;
    export type ToolContractVersion = string;
    /**
     * @maxItems 20
     */
    export type Warnings1 =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type Delta = string | null;
    export type Code =
        | "unauthenticated"
        | "forbidden"
        | "feature_not_enabled"
        | "byo_llm_not_enabled"
        | "provider_not_configured"
        | "model_not_supported"
        | "provider_unavailable"
        | "rate_limited"
        | "concurrency_limited"
        | "cost_limit_reached"
        | "invalid_request"
        | "scope_ambiguous"
        | "scope_not_found"
        | "scope_forbidden"
        | "conversation_not_found"
        | "conversation_expired"
        | "tool_limit_reached"
        | "tool_unavailable"
        | "source_unavailable"
        | "insufficient_evidence"
        | "answer_validation_failed"
        | "cancelled"
        | "provider_contract_violation"
        | "internal_error"
        | "refused";
    export type LimitResetAt = string | null;
    /**
     * @maxItems 5
     */
    export type Remediation =
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string];
    export type RequestId = string;
    export type Retryable = boolean;
    export type SafeMessage = string;
    export type SchemaVersion6 = "dev_error.v1";
    export type StreamEventType =
        | "run.started"
        | "scope.resolved"
        | "progress"
        | "answer.delta"
        | "answer.completed"
        | "warning"
        | "error"
        | "done";
    export type OccurredAt = string;
    export type ProgressState =
        | "resolving_scope"
        | "checking_status"
        | "querying_metrics"
        | "checking_dependencies"
        | "checking_evidence"
        | "checking_data_freshness"
        | "preparing_answer";
    export type RunId = string;
    export type SchemaVersion7 = "dev_stream_event.v1";
    export type Sequence = number;
    export type TerminalKind = ("answer" | "error") | null;
    export type Warning = string | null;

    export interface DevStreamEvent {
        answer?: DevAnswer | null;
        delta?: Delta;
        error?: DevError | null;
        event: StreamEventType;
        occurred_at: OccurredAt;
        progress?: ProgressState | null;
        run_id: RunId;
        schema_version: SchemaVersion7;
        scope_resolution?: DevScopeResolution | null;
        sequence: Sequence;
        terminal_kind?: TerminalKind;
        warning?: Warning;
    }
    export interface DevAnswer {
        answer_id: AnswerId;
        as_of: AsOf;
        claims?: Claims;
        conflicts?: Conflicts;
        conversation_id: ConversationId;
        coverage: DevCoverage;
        direct_summary: DirectSummary;
        evidence?: Evidence;
        generated_at: GeneratedAt;
        metrics?: Metrics;
        model: DevModelMetadata;
        resolved_scope: DevScopeResolution;
        schema_version: SchemaVersion5;
        status: AnswerStatus;
        suggested_follow_up_questions?: SuggestedFollowUpQuestions;
        versions: DevContractVersions;
        warnings?: Warnings1;
    }
    export interface DevClaim {
        claim_id: ClaimId;
        confidence: Confidence;
        evidence_ref_ids?: EvidenceRefIds;
        flags: DevClaimFlags;
        kind: ClaimKind;
        metric_ref_ids?: MetricRefIds;
        recommendation_rule_version?: RecommendationRuleVersion;
        schema_version: SchemaVersion;
        text: Text;
        validity_scope: DevScope;
    }
    export interface DevClaimFlags {
        conflicting?: Conflicting;
        stale?: Stale;
        uncertain?: Uncertain;
        untrusted_source?: UntrustedSource;
    }
    export interface DevScope {
        comparison_range?: DevTimeRange | null;
        direct_scope: DirectScope;
        entity_refs?: EntityRefs;
        organization_id: OrganizationId;
        repositories?: Repositories;
        schema_version: SchemaVersion1;
        surface_context?: DevSurfaceContext | null;
        team_ids?: TeamIds;
        time_range: DevTimeRange;
    }
    export interface DevTimeRange {
        end: End;
        start: Start;
        timezone: Timezone;
    }
    export interface DevEntityRef {
        display_label: DisplayLabel;
        entity_id: EntityId;
        entity_type: EntityType;
        repository_id?: RepositoryId;
    }
    export interface DevSurfaceContext {
        entity_refs?: EntityRefs1;
        filter_fingerprint?: FilterFingerprint;
        route_id: AskDevSurfaceRouteID;
    }
    export interface DevConflict {
        evidence_ref_ids: EvidenceRefIds1;
        summary: Summary;
    }
    export interface DevCoverage {
        as_of: AsOf1;
        available_source_count: AvailableSourceCount;
        degraded_required_sources?: DegradedRequiredSources;
        required_source_count: RequiredSourceCount;
        stale_required_sources?: StaleRequiredSources;
        unavailable_required_sources?: UnavailableRequiredSources;
    }
    export interface DevEvidenceRef {
        citation_text?: CitationText;
        confidence: Confidence1;
        display_label: DisplayLabel1;
        entity_id: EntityId1;
        entity_type: EntityType1;
        evidence_ref_id: EvidenceRefId;
        flags: DevEvidenceFlags;
        freshness: FreshnessState;
        link?: DevCitationLink | null;
        observed_at: ObservedAt;
        provenance: Provenance;
        repository_ids?: RepositoryIds;
        schema_version: SchemaVersion2;
        source_system: SourceSystem;
        source_version: SourceVersion;
        valid_entity_ids?: ValidEntityIds;
    }
    export interface DevEvidenceFlags {
        conflicting?: Conflicting1;
        deleted?: Deleted;
        redacted?: Redacted;
        stale?: Stale1;
        unavailable?: Unavailable;
        uncertain?: Uncertain1;
        untrusted_content?: UntrustedContent;
    }
    export interface DevCitationLink {
        internal_path?: InternalPath;
        source_url?: SourceUrl;
    }
    export interface DevMetricRef {
        aggregation: Aggregation;
        comparison_value?: ComparisonValue;
        comparison_window?: DevTimeRange | null;
        coverage: Coverage;
        current_window: DevTimeRange;
        definition_version: DefinitionVersion;
        dimensions?: Dimensions;
        display_precision: DisplayPrecision;
        evidence_ref_ids?: EvidenceRefIds2;
        freshness: FreshnessState;
        label: Label;
        metric_id: MetricID;
        metric_ref_id: MetricRefId;
        query_version: QueryVersion;
        resolved_scope: DevScope;
        schema_version: SchemaVersion3;
        series?: Series;
        source_version: SourceVersion1;
        unit: Unit;
        value?: Value1;
    }
    export interface DevMetricPoint {
        timestamp: Timestamp;
        value: Value;
    }
    export interface DevModelMetadata {
        model_fingerprint: ModelFingerprint;
        provider_family: ProviderFamily;
        provider_source: ProviderSource;
    }
    export interface DevScopeResolution {
        authorized_entity_ids?: AuthorizedEntityIds;
        authorized_repository_ids?: AuthorizedRepositoryIds;
        candidates?: Candidates;
        fallbacks?: Fallbacks;
        outcome: ScopeResolutionOutcome;
        requested_scope: DevScope;
        resolved_at: ResolvedAt;
        resolved_scope?: DevScope | null;
        schema_version: SchemaVersion4;
        warnings?: Warnings;
    }
    export interface DevDisambiguationCandidate {
        entity_ref: DevEntityRef;
        reason: Reason;
        repository_id?: RepositoryId1;
    }
    export interface DevContractVersions {
        metric_definition_version: MetricDefinitionVersion;
        prompt_version: PromptVersion;
        query_version: QueryVersion1;
        tool_contract_version: ToolContractVersion;
    }
    export interface DevError {
        code: Code;
        limit_reset_at?: LimitResetAt;
        remediation?: Remediation;
        request_id: RequestId;
        retryable: Retryable;
        safe_message: SafeMessage;
        schema_version: SchemaVersion6;
    }
}
export type DevStreamEvent = DevStreamEventContract.DevStreamEvent;
export namespace DevToolRequestContract {
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds = string[];
    export type IncludeComparison = boolean;
    export type Limit = number;
    export type MetricID =
        | "items_completed"
        | "cycle_time_p50_hours"
        | "avg_wip"
        | "deployments_count"
        | "change_failure_rate"
        | "investment_allocation_pct"
        | "cyclomatic_per_kloc"
        | "compounding_risk_score";
    export type Query = string | null;
    export type RunId = string;
    export type SchemaVersion = "dev_tool_request.v1";
    export type End = string;
    export type Start = string;
    export type Timezone = string;
    export type DirectScope =
        "organization" | "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    /**
     * @maxItems 20
     */
    export type EntityRefs =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type DisplayLabel = string;
    export type EntityId = string;
    export type EntityType =
        "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    export type RepositoryId = string | null;
    export type OrganizationId = string;
    /**
     * @maxItems 20
     */
    export type Repositories =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion1 = "dev_scope.v1";
    /**
     * @maxItems 20
     */
    export type EntityRefs1 =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type FilterFingerprint = string | null;
    export type AskDevSurfaceRouteID =
        | "diagnose_overview"
        | "flow_metrics"
        | "investment"
        | "work_graph"
        | "complexity"
        | "cognitive_load"
        | "bottlenecks"
        | "repository_detail"
        | "project_detail"
        | "work_unit_detail"
        | "issue_detail"
        | "pull_request_detail"
        | "data_health";
    /**
     * @maxItems 20
     */
    export type TeamIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type ToolCallId = string;
    export type ToolID =
        | "resolve_scope.v1"
        | "list_metrics.v1"
        | "query_metric.v1"
        | "status_snapshot.v1"
        | "change_summary.v1"
        | "work_graph_neighbors.v1"
        | "search_evidence.v1"
        | "get_evidence.v1"
        | "data_health.v1";

    export interface DevToolRequest {
        evidence_ref_ids?: EvidenceRefIds;
        include_comparison?: IncludeComparison;
        limit?: Limit;
        metric_id?: MetricID | null;
        query?: Query;
        run_id: RunId;
        schema_version: SchemaVersion;
        scope: DevScope;
        tool_call_id: ToolCallId;
        tool_id: ToolID;
    }
    export interface DevScope {
        comparison_range?: DevTimeRange | null;
        direct_scope: DirectScope;
        entity_refs?: EntityRefs;
        organization_id: OrganizationId;
        repositories?: Repositories;
        schema_version: SchemaVersion1;
        surface_context?: DevSurfaceContext | null;
        team_ids?: TeamIds;
        time_range: DevTimeRange;
    }
    export interface DevTimeRange {
        end: End;
        start: Start;
        timezone: Timezone;
    }
    export interface DevEntityRef {
        display_label: DisplayLabel;
        entity_id: EntityId;
        entity_type: EntityType;
        repository_id?: RepositoryId;
    }
    export interface DevSurfaceContext {
        entity_refs?: EntityRefs1;
        filter_fingerprint?: FilterFingerprint;
        route_id: AskDevSurfaceRouteID;
    }
}
export type DevToolRequest = DevToolRequestContract.DevToolRequest;
export namespace DevToolResultContract {
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds = string[];
    export type FactId = string;
    export type Status = string;
    export type Text = string;
    /**
     * @maxItems 100
     */
    export type Blockers = DevRequiredChildFact[];
    /**
     * @maxItems 20
     */
    export type Conflicts =
        | []
        | [DevStatusConflict]
        | [DevStatusConflict, DevStatusConflict]
        | [DevStatusConflict, DevStatusConflict, DevStatusConflict]
        | [DevStatusConflict, DevStatusConflict, DevStatusConflict, DevStatusConflict]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ]
        | [
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
              DevStatusConflict,
          ];
    export type Code = string;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds1 = string[];
    export type Message = string;
    export type Severity = "warning" | "blocking";
    export type DisplayTruncated = boolean;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds2 = string[];
    /**
     * @maxItems 25
     */
    export type ReasonCodes = string[];
    export type RequiredChildComplete = number | null;
    export type RequiredChildTotal = number | null;
    /**
     * @maxItems 100
     */
    export type RequiredChildren = DevRequiredChildFact[];
    export type RequiredChildrenNotApplicable = boolean;
    export type RuleId = string;
    export type RuleVersion = string;
    export type State = "ready" | "not_ready" | "indeterminate";
    export type Conclusion = string;
    export type DisplayLabel = string;
    export type EntityId = string;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds3 = string[];
    export type ObservedAt = string;
    export type Required = boolean | null;
    export type SkippedRequiredWork = boolean | null;
    /**
     * @maxItems 100
     */
    export type CiChecks = DevCIFact[];
    export type Coverage = number;
    export type FreshnessState = "fresh" | "stale" | "unavailable" | "unknown";
    export type LastSuccessfulAt = string | null;
    export type SourceSystem = string;
    export type Warning = string | null;
    /**
     * @maxItems 25
     */
    export type DataHealth = DevDataHealth[];
    /**
     * @maxItems 25
     */
    export type DeclaredProjectEvidenceRefIds = string[];
    export type DeclaredProjectState = string | null;
    export type DeclaredProjectTargetDate = string | null;
    export type DisplayLabel1 = string;
    export type EntityId1 = string;
    export type Environment = string | null;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds4 = string[];
    export type ObservedAt1 = string;
    export type Required1 = boolean;
    export type Status1 = string;
    /**
     * @maxItems 100
     */
    export type Deployments = DevDeploymentFact[];
    export type Code1 =
        | "unauthenticated"
        | "forbidden"
        | "feature_not_enabled"
        | "byo_llm_not_enabled"
        | "provider_not_configured"
        | "model_not_supported"
        | "provider_unavailable"
        | "rate_limited"
        | "concurrency_limited"
        | "cost_limit_reached"
        | "invalid_request"
        | "scope_ambiguous"
        | "scope_not_found"
        | "scope_forbidden"
        | "conversation_not_found"
        | "conversation_expired"
        | "tool_limit_reached"
        | "tool_unavailable"
        | "source_unavailable"
        | "insufficient_evidence"
        | "answer_validation_failed"
        | "cancelled"
        | "provider_contract_violation"
        | "internal_error"
        | "refused";
    export type LimitResetAt = string | null;
    /**
     * @maxItems 5
     */
    export type Remediation =
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string];
    export type RequestId = string;
    export type Retryable = boolean;
    export type SafeMessage = string;
    export type SchemaVersion = "dev_error.v1";
    export type CitationText = string | null;
    export type Confidence = number;
    export type DisplayLabel2 = string;
    export type EntityId2 = string;
    export type EntityType = string;
    export type EvidenceRefId = string;
    export type Conflicting = boolean;
    export type Deleted = boolean;
    export type Redacted = boolean;
    export type Stale = boolean;
    export type Unavailable = boolean;
    export type Uncertain = boolean;
    export type UntrustedContent = boolean;
    export type InternalPath = string | null;
    export type SourceUrl = string | null;
    export type ObservedAt2 = string;
    export type Provenance = string;
    /**
     * @maxItems 20
     */
    export type RepositoryIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion1 = "dev_evidence_ref.v1";
    export type SourceSystem1 = string;
    export type SourceVersion = string;
    /**
     * @maxItems 20
     */
    export type ValidEntityIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    /**
     * @maxItems 25
     */
    export type Evidence = DevEvidenceRef[];
    export type Confidence1 = number;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds5 = string[];
    export type ObservedAt3 = string;
    export type Provenance1 = string;
    export type Relationship = string;
    export type SourceEntityId = string;
    export type TargetEntityId = string;
    /**
     * @maxItems 100
     */
    export type GraphEdges = DevGraphEdge[];
    export type Active = boolean;
    export type Blocking = boolean;
    export type DisplayLabel3 = string;
    export type EntityId3 = string;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds6 = string[];
    export type ObservedAt4 = string;
    export type Status2 = string;
    /**
     * @maxItems 100
     */
    export type Incidents = DevIncidentFact[];
    /**
     * @maxItems 12
     */
    export type MetricDefinitions =
        | []
        | [DevMetricDefinition]
        | [DevMetricDefinition, DevMetricDefinition]
        | [DevMetricDefinition, DevMetricDefinition, DevMetricDefinition]
        | [DevMetricDefinition, DevMetricDefinition, DevMetricDefinition, DevMetricDefinition]
        | [
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
          ]
        | [
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
          ]
        | [
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
          ]
        | [
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
          ]
        | [
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
          ]
        | [
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
          ]
        | [
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
          ]
        | [
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
              DevMetricDefinition,
          ];
    export type DefinitionVersion = string;
    export type Description = string;
    export type FreshnessPolicy = string;
    export type Label = string;
    export type MetricID =
        | "items_completed"
        | "cycle_time_p50_hours"
        | "avg_wip"
        | "deployments_count"
        | "change_failure_rate"
        | "investment_allocation_pct"
        | "cyclomatic_per_kloc"
        | "compounding_risk_score";
    /**
     * @maxItems 12
     */
    export type SupportedDimensions =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
          ];
    /**
     * @minItems 1
     * @maxItems 8
     */
    export type SupportedScopes =
        | [DirectScope]
        | [DirectScope, DirectScope]
        | [DirectScope, DirectScope, DirectScope]
        | [DirectScope, DirectScope, DirectScope, DirectScope]
        | [DirectScope, DirectScope, DirectScope, DirectScope, DirectScope]
        | [DirectScope, DirectScope, DirectScope, DirectScope, DirectScope, DirectScope]
        | [
              DirectScope,
              DirectScope,
              DirectScope,
              DirectScope,
              DirectScope,
              DirectScope,
              DirectScope,
          ]
        | [
              DirectScope,
              DirectScope,
              DirectScope,
              DirectScope,
              DirectScope,
              DirectScope,
              DirectScope,
              DirectScope,
          ];
    export type DirectScope =
        "organization" | "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    /**
     * @maxItems 12
     */
    export type SupportedTimeGrains =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
          ];
    export type Unit = string;
    /**
     * @maxItems 12
     */
    export type Metrics =
        | []
        | [DevMetricRef]
        | [DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef]
        | [DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef, DevMetricRef]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ]
        | [
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
              DevMetricRef,
          ];
    export type Aggregation = string;
    export type ComparisonValue = number | null;
    export type End = string;
    export type Start = string;
    export type Timezone = string;
    export type Coverage1 = number;
    export type DefinitionVersion1 = string;
    /**
     * @maxItems 12
     */
    export type Dimensions =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
          ];
    export type DisplayPrecision = number;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds7 = string[];
    export type Label1 = string;
    export type MetricRefId = string;
    export type QueryVersion = string;
    /**
     * @maxItems 20
     */
    export type EntityRefs =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type DisplayLabel4 = string;
    export type EntityId4 = string;
    export type EntityType1 =
        "repository" | "project" | "work_unit" | "issue" | "pull_request" | "team";
    export type RepositoryId = string | null;
    export type OrganizationId = string;
    /**
     * @maxItems 20
     */
    export type Repositories =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion2 = "dev_scope.v1";
    /**
     * @maxItems 20
     */
    export type EntityRefs1 =
        | []
        | [DevEntityRef]
        | [DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef, DevEntityRef]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ]
        | [
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
              DevEntityRef,
          ];
    export type FilterFingerprint = string | null;
    export type AskDevSurfaceRouteID =
        | "diagnose_overview"
        | "flow_metrics"
        | "investment"
        | "work_graph"
        | "complexity"
        | "cognitive_load"
        | "bottlenecks"
        | "repository_detail"
        | "project_detail"
        | "work_unit_detail"
        | "issue_detail"
        | "pull_request_detail"
        | "data_health";
    /**
     * @maxItems 20
     */
    export type TeamIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SchemaVersion3 = "dev_metric_ref.v1";
    export type Timestamp = string;
    export type Value = number;
    /**
     * @maxItems 366
     */
    export type Series = DevMetricPoint[];
    export type SourceVersion1 = string;
    export type Unit1 = string;
    export type Value1 = number | null;
    export type ChangesRequested = number;
    export type DisplayLabel5 = string;
    export type EntityId5 = string;
    /**
     * @maxItems 25
     */
    export type EvidenceRefIds8 = string[];
    export type Merged = boolean;
    export type ObservedAt5 = string;
    export type Required2 = boolean;
    export type ReviewState = string | null;
    export type State1 = string;
    /**
     * @maxItems 100
     */
    export type PullRequests = DevPullRequestFact[];
    export type RunId = string;
    export type SchemaVersion4 = "dev_tool_result.v1";
    /**
     * @maxItems 20
     */
    export type AuthorizedEntityIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    /**
     * @maxItems 20
     */
    export type AuthorizedRepositoryIds =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type Reason = string;
    export type RepositoryId1 = string | null;
    /**
     * @maxItems 25
     */
    export type Candidates = DevDisambiguationCandidate[];
    /**
     * @maxItems 10
     */
    export type Fallbacks =
        | []
        | [string]
        | [string, string]
        | [string, string, string]
        | [string, string, string, string]
        | [string, string, string, string, string]
        | [string, string, string, string, string, string]
        | [string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string]
        | [string, string, string, string, string, string, string, string, string, string];
    export type ScopeResolutionOutcome =
        | "exact"
        | "filtered"
        | "inherited"
        | "organization_fallback"
        | "ambiguous"
        | "unresolved"
        | "forbidden_or_not_found";
    export type ResolvedAt = string;
    export type SchemaVersion5 = "dev_scope_resolution.v1";
    /**
     * @maxItems 20
     */
    export type Warnings =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];
    export type SerializedBytes = number;
    export type RefId = string;
    export type SourceSystem2 = string;
    export type Watermark = string | null;
    /**
     * @maxItems 25
     */
    export type SourceHealth = DevSourceHealth[];
    export type Status3 = "success" | "partial" | "unavailable" | "error";
    /**
     * @minItems 1
     * @maxItems 25
     */
    export type EvidenceRefIds9 = [string, ...string[]];
    export type FactId1 = string;
    export type Text1 = string;
    /**
     * @maxItems 100
     */
    export type StatusFacts = DevStatusFact[];
    export type ToolCallId = string;
    export type ToolID =
        | "resolve_scope.v1"
        | "list_metrics.v1"
        | "query_metric.v1"
        | "status_snapshot.v1"
        | "change_summary.v1"
        | "work_graph_neighbors.v1"
        | "search_evidence.v1"
        | "get_evidence.v1"
        | "data_health.v1";
    /**
     * @maxItems 20
     */
    export type Warnings1 =
        | []
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
        | [string, string, string, string, string, string, string, string, string, string, string]
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
              string,
              string,
              string,
              string,
          ];

    export interface DevToolResult {
        actual_completion?: DevActualCompletion | null;
        ci_checks?: CiChecks;
        data_health?: DataHealth;
        declared_project_evidence_ref_ids?: DeclaredProjectEvidenceRefIds;
        declared_project_state?: DeclaredProjectState;
        declared_project_target_date?: DeclaredProjectTargetDate;
        deployments?: Deployments;
        error?: DevError | null;
        evidence?: Evidence;
        graph_edges?: GraphEdges;
        incidents?: Incidents;
        metric_definitions?: MetricDefinitions;
        metrics?: Metrics;
        pull_requests?: PullRequests;
        run_id: RunId;
        schema_version: SchemaVersion4;
        scope_resolution?: DevScopeResolution | null;
        serialized_bytes: SerializedBytes;
        source_health?: SourceHealth;
        status: Status3;
        status_facts?: StatusFacts;
        tool_call_id: ToolCallId;
        tool_id: ToolID;
        warnings?: Warnings1;
    }
    /**
     * Server-computed ``actual-completion`` rule result; the LLM explains, never derives, it.
     */
    export interface DevActualCompletion {
        blockers?: Blockers;
        conflicts?: Conflicts;
        display_truncated?: DisplayTruncated;
        evidence_ref_ids?: EvidenceRefIds2;
        reason_codes?: ReasonCodes;
        required_child_complete?: RequiredChildComplete;
        required_child_total?: RequiredChildTotal;
        required_children?: RequiredChildren;
        required_children_not_applicable?: RequiredChildrenNotApplicable;
        rule_id: RuleId;
        rule_version: RuleVersion;
        state: State;
    }
    export interface DevRequiredChildFact {
        evidence_ref_ids?: EvidenceRefIds;
        fact_id: FactId;
        status: Status;
        text: Text;
    }
    export interface DevStatusConflict {
        code: Code;
        evidence_ref_ids?: EvidenceRefIds1;
        message: Message;
        severity: Severity;
    }
    export interface DevCIFact {
        conclusion: Conclusion;
        display_label: DisplayLabel;
        entity_id: EntityId;
        evidence_ref_ids?: EvidenceRefIds3;
        observed_at: ObservedAt;
        required?: Required;
        skipped_required_work?: SkippedRequiredWork;
    }
    export interface DevDataHealth {
        coverage: Coverage;
        freshness: FreshnessState;
        last_successful_at?: LastSuccessfulAt;
        source_system: SourceSystem;
        warning?: Warning;
    }
    export interface DevDeploymentFact {
        display_label: DisplayLabel1;
        entity_id: EntityId1;
        environment?: Environment;
        evidence_ref_ids?: EvidenceRefIds4;
        observed_at: ObservedAt1;
        required: Required1;
        status: Status1;
    }
    export interface DevError {
        code: Code1;
        limit_reset_at?: LimitResetAt;
        remediation?: Remediation;
        request_id: RequestId;
        retryable: Retryable;
        safe_message: SafeMessage;
        schema_version: SchemaVersion;
    }
    export interface DevEvidenceRef {
        citation_text?: CitationText;
        confidence: Confidence;
        display_label: DisplayLabel2;
        entity_id: EntityId2;
        entity_type: EntityType;
        evidence_ref_id: EvidenceRefId;
        flags: DevEvidenceFlags;
        freshness: FreshnessState;
        link?: DevCitationLink | null;
        observed_at: ObservedAt2;
        provenance: Provenance;
        repository_ids?: RepositoryIds;
        schema_version: SchemaVersion1;
        source_system: SourceSystem1;
        source_version: SourceVersion;
        valid_entity_ids?: ValidEntityIds;
    }
    export interface DevEvidenceFlags {
        conflicting?: Conflicting;
        deleted?: Deleted;
        redacted?: Redacted;
        stale?: Stale;
        unavailable?: Unavailable;
        uncertain?: Uncertain;
        untrusted_content?: UntrustedContent;
    }
    export interface DevCitationLink {
        internal_path?: InternalPath;
        source_url?: SourceUrl;
    }
    export interface DevGraphEdge {
        confidence: Confidence1;
        evidence_ref_ids?: EvidenceRefIds5;
        observed_at: ObservedAt3;
        provenance: Provenance1;
        relationship: Relationship;
        source_entity_id: SourceEntityId;
        target_entity_id: TargetEntityId;
    }
    export interface DevIncidentFact {
        active: Active;
        blocking: Blocking;
        display_label: DisplayLabel3;
        entity_id: EntityId3;
        evidence_ref_ids?: EvidenceRefIds6;
        observed_at: ObservedAt4;
        status: Status2;
    }
    export interface DevMetricDefinition {
        definition_version: DefinitionVersion;
        description: Description;
        freshness_policy: FreshnessPolicy;
        label: Label;
        metric_id: MetricID;
        supported_dimensions?: SupportedDimensions;
        supported_scopes: SupportedScopes;
        supported_time_grains?: SupportedTimeGrains;
        unit: Unit;
    }
    export interface DevMetricRef {
        aggregation: Aggregation;
        comparison_value?: ComparisonValue;
        comparison_window?: DevTimeRange | null;
        coverage: Coverage1;
        current_window: DevTimeRange;
        definition_version: DefinitionVersion1;
        dimensions?: Dimensions;
        display_precision: DisplayPrecision;
        evidence_ref_ids?: EvidenceRefIds7;
        freshness: FreshnessState;
        label: Label1;
        metric_id: MetricID;
        metric_ref_id: MetricRefId;
        query_version: QueryVersion;
        resolved_scope: DevScope;
        schema_version: SchemaVersion3;
        series?: Series;
        source_version: SourceVersion1;
        unit: Unit1;
        value?: Value1;
    }
    export interface DevTimeRange {
        end: End;
        start: Start;
        timezone: Timezone;
    }
    export interface DevScope {
        comparison_range?: DevTimeRange | null;
        direct_scope: DirectScope;
        entity_refs?: EntityRefs;
        organization_id: OrganizationId;
        repositories?: Repositories;
        schema_version: SchemaVersion2;
        surface_context?: DevSurfaceContext | null;
        team_ids?: TeamIds;
        time_range: DevTimeRange;
    }
    export interface DevEntityRef {
        display_label: DisplayLabel4;
        entity_id: EntityId4;
        entity_type: EntityType1;
        repository_id?: RepositoryId;
    }
    export interface DevSurfaceContext {
        entity_refs?: EntityRefs1;
        filter_fingerprint?: FilterFingerprint;
        route_id: AskDevSurfaceRouteID;
    }
    export interface DevMetricPoint {
        timestamp: Timestamp;
        value: Value;
    }
    export interface DevPullRequestFact {
        changes_requested: ChangesRequested;
        display_label: DisplayLabel5;
        entity_id: EntityId5;
        evidence_ref_ids?: EvidenceRefIds8;
        merged: Merged;
        observed_at: ObservedAt5;
        required: Required2;
        review_state?: ReviewState;
        state: State1;
    }
    export interface DevScopeResolution {
        authorized_entity_ids?: AuthorizedEntityIds;
        authorized_repository_ids?: AuthorizedRepositoryIds;
        candidates?: Candidates;
        fallbacks?: Fallbacks;
        outcome: ScopeResolutionOutcome;
        requested_scope: DevScope;
        resolved_at: ResolvedAt;
        resolved_scope?: DevScope | null;
        schema_version: SchemaVersion5;
        warnings?: Warnings;
    }
    export interface DevDisambiguationCandidate {
        entity_ref: DevEntityRef;
        reason: Reason;
        repository_id?: RepositoryId1;
    }
    export interface DevSourceHealth {
        freshness: FreshnessState;
        ref_id: RefId;
        source_system: SourceSystem2;
        watermark?: Watermark;
    }
    export interface DevStatusFact {
        evidence_ref_ids: EvidenceRefIds9;
        fact_id: FactId1;
        text: Text1;
    }
}
export type DevToolResult = DevToolResultContract.DevToolResult;
