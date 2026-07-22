import { z } from "zod";
import type { IntegrationCredential } from "./types";

export type SyncConfigInitialSelection = {
    readonly provider: "pagerduty";
    readonly credentialId: string;
};

const pagerDutyPreselectionSchema = z.object({
    provider: z.literal("pagerduty"),
    credential_name: z.string().trim().min(1).max(255),
});

export function resolvePagerDutySyncConfigPreselection(
    query: Record<string, string | readonly string[] | undefined>,
    credentials: readonly IntegrationCredential[],
    canCreatePagerDuty: boolean,
): SyncConfigInitialSelection | null {
    if (!canCreatePagerDuty) return null;
    const parsed = pagerDutyPreselectionSchema.safeParse({
        provider: query.provider,
        credential_name: query.credential_name,
    });
    if (!parsed.success) return null;
    const credential = credentials.find(
        (candidate) =>
            candidate.provider === parsed.data.provider &&
            candidate.name === parsed.data.credential_name,
    );
    return credential ? { provider: "pagerduty", credentialId: credential.id } : null;
}

export function pagerDutySyncConfigPath(credentialName: string): string {
    return `/org/admin/sync/new?provider=pagerduty&credential_name=${encodeURIComponent(credentialName)}`;
}
