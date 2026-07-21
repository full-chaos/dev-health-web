import { describe, expect, it } from "vitest";
import {
    CANONICAL_INCIDENT_INGESTION_FEATURE,
    isCanonicalIncidentIngestionEnabled,
} from "../canonicalIncidentIngestion";

describe("canonical incident ingestion entitlement", () => {
    it("fails closed when an older Ops response omits the feature", () => {
        expect(isCanonicalIncidentIngestionEnabled({ features: {} })).toBe(false);
    });

    it("fails closed when the feature is explicitly disabled or malformed", () => {
        expect(
            isCanonicalIncidentIngestionEnabled({
                features: { [CANONICAL_INCIDENT_INGESTION_FEATURE]: false },
            }),
        ).toBe(false);
        expect(
            isCanonicalIncidentIngestionEnabled({
                features: { [CANONICAL_INCIDENT_INGESTION_FEATURE]: "enabled" },
            }),
        ).toBe(false);
    });

    it("allows only an explicit true entitlement", () => {
        expect(
            isCanonicalIncidentIngestionEnabled({
                features: { [CANONICAL_INCIDENT_INGESTION_FEATURE]: true },
            }),
        ).toBe(true);
    });
});
