"use server";

import { AdminApiError, adminApi } from "../api";
import { isCanonicalIncidentIngestionEnabled } from "../canonicalIncidentIngestion";
import type { Result } from "@/lib/result";
import { getSessionContext, withErrorHandling } from "./_shared";

const PAGERDUTY_CONNECTIONS_UNAVAILABLE_MESSAGE =
    "PagerDuty connections are currently unavailable.";

type CanonicalIncidentIngestionEntitlement = {
    readonly enabled: boolean;
};

export async function getCanonicalIncidentIngestionEntitlement(): Promise<
    Result<CanonicalIncidentIngestionEntitlement>
> {
    return withErrorHandling(async () => {
        const { token, orgId } = await getSessionContext();
        if (!orgId) {
            throw new AdminApiError(400, "Bad Request", "No organization ID in session");
        }

        const entitlements = await adminApi.licensing.entitlements(orgId, token, orgId);
        return { enabled: isCanonicalIncidentIngestionEnabled(entitlements) };
    });
}

export async function requirePagerDutyCreationEntitlement(): Promise<void> {
    const entitlement = await getCanonicalIncidentIngestionEntitlement();
    if (entitlement.data?.enabled !== true) {
        throw new AdminApiError(403, "Forbidden", PAGERDUTY_CONNECTIONS_UNAVAILABLE_MESSAGE);
    }
}
