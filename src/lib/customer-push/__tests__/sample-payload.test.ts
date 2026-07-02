import { describe, expect, it } from "vitest";
import { buildSamplePayload } from "../sample-payload";

describe("buildSamplePayload", () => {
    it("builds a git-family repository record for github/gitlab/custom", () => {
        for (const system of ["github", "gitlab", "custom"] as const) {
            const payload = buildSamplePayload(system, "acme/api") as {
                schemaVersion: string;
                records: Array<{ kind: string; externalId: string; payload: unknown }>;
            };
            expect(payload.schemaVersion).toBe("external-ingest.v1");
            expect(payload.records).toHaveLength(1);
            expect(payload.records[0].kind).toBe("repository.v1");
            expect(payload.records[0].externalId).toBe("acme/api");
        }
    });

    it("builds a work_item record for jira/linear", () => {
        for (const system of ["jira", "linear"] as const) {
            const payload = buildSamplePayload(system, "CHAOS") as {
                records: Array<{ kind: string; externalId: string }>;
            };
            expect(payload.records).toHaveLength(1);
            expect(payload.records[0].kind).toBe("work_item.v1");
            expect(payload.records[0].externalId).toBe("CHAOS-1");
        }
    });

    it("stamps the source system and instance onto the envelope", () => {
        const payload = buildSamplePayload("github", "acme/api") as {
            source: { system: string; instance: string; type: string };
        };
        expect(payload.source.system).toBe("github");
        expect(payload.source.instance).toBe("acme/api");
        expect(payload.source.type).toBe("customer_push");
    });

    it("every record carries a non-empty externalId (required by the validate mock/backend)", () => {
        const payload = buildSamplePayload("github", "acme/api") as {
            records: Array<{ externalId: string }>;
        };
        for (const record of payload.records) {
            expect(record.externalId).toBeTruthy();
        }
    });
});
