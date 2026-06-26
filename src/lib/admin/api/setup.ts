import { request } from "./_request";
import type { SetupStatus } from "@/lib/onboarding/types";

/**
 * CHAOS-2670 C2: first-run setup status (`GET /api/v1/admin/setup/status`).
 *
 * Powers the dashboard's value-or-precise-blocker surface and the first-run
 * sync UI. REST only — the shape lives in `@/lib/onboarding/types`, not the
 * GraphQL schema.
 */
export const setupApi = {
    status: (token?: string, orgId?: string) =>
        request<SetupStatus>("/setup/status", {}, token, orgId),
};
