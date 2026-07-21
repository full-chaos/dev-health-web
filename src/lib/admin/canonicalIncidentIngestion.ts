import { z } from "zod";

export const CANONICAL_INCIDENT_INGESTION_FEATURE = "canonical_incident_ingestion";

const EntitlementFeaturesSchema = z.object({
    features: z.record(z.string(), z.boolean()),
});

export function isCanonicalIncidentIngestionEnabled(entitlements: unknown): boolean {
    const parsed = EntitlementFeaturesSchema.safeParse(entitlements);
    return parsed.success && parsed.data.features[CANONICAL_INCIDENT_INGESTION_FEATURE] === true;
}
