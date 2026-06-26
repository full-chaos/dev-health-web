/**
 * CHAOS-2670 first-run onboarding contracts (frozen seam types).
 *
 * Mirror of the backend Pydantic response models so the guided-onboarding
 * frontend (CHAOS-2674/2675/2678/2681) can build against a stable shape before
 * the live endpoints land. Keep in lockstep with
 * `ops/.../api/admin/schemas_flat.py` `OnboardingStateResponse` /
 * `SetupStatusResponse`. These are REST payloads, not GraphQL — do not add them
 * to `schema.graphql`.
 */

/** C1: `GET /api/v1/auth/onboarding/state` next-step routing target. */
export type OnboardingNextStep = "workspace" | "integration" | "complete" | "dashboard";

/** C1 response body. Single source of truth for first-run routing. */
export interface OnboardingState {
    needs_onboarding: boolean;
    org_created: boolean;
    org_id: string | null;
    org_name: string | null;
    first_integration_connected: boolean;
    integration_skipped: boolean;
    recommended_provider: string;
    next_step: OnboardingNextStep;
    blocker: string | null;
}

/** C2: `GET /api/v1/admin/setup/status` sync lifecycle state. */
export type SetupSyncStatus = "none" | "pending" | "running" | "partial" | "complete" | "failed";

/** C2: next setup action the dashboard/onboarding should drive the user toward. */
export type SetupNextAction =
    | "connect_integration"
    | "select_repositories"
    | "create_sync_config"
    | "start_sync"
    | "complete";

/** C2 response body. Powers the dashboard value-or-precise-blocker surface. */
export interface SetupStatus {
    has_integration: boolean;
    providers: string[];
    has_sync_config: boolean;
    sync_config_id: string | null;
    first_sync_started: boolean;
    sync_status: SetupSyncStatus;
    selected_repositories_count: number;
    last_sync_error: string | null;
    can_start_sync: boolean;
    next_action: SetupNextAction;
    blocker: string | null;
}
