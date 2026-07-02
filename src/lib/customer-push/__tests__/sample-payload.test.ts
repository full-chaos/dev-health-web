import { describe, expect, it } from "vitest";
import { buildSamplePayload } from "../sample-payload";

describe("buildSamplePayload", () => {
    it("builds a repository.v1 record for git-family systems", () => {
        for (const system of ["github", "gitlab", "custom"] as const) {
            const payload = buildSamplePayload(system, "meridian/api") as {
                records: Array<{ kind: string; externalId: string }>;
            };
            expect(payload.records).toHaveLength(1);
            expect(payload.records[0].kind).toBe("repository.v1");
            expect(payload.records[0].externalId).toBe("meridian/api");
        }
    });

    it("builds a work_item.v1 record for jira/linear", () => {
        for (const system of ["jira", "linear"] as const) {
            const payload = buildSamplePayload(system, "CHAOS") as {
                records: Array<{ kind: string }>;
            };
            expect(payload.records[0].kind).toBe("work_item.v1");
        }
    });

    it("includes the source system and instance in the envelope", () => {
        const payload = buildSamplePayload("github", "meridian/api") as {
            source: { system: string; instance: string };
        };
        expect(payload.source.system).toBe("github");
        expect(payload.source.instance).toBe("meridian/api");
    });

    it("uses a producer string that never collides with the cut web-console leg", () => {
        const payload = buildSamplePayload("github", "meridian/api") as {
            source: { producer: string };
        };
        expect(payload.source.producer).not.toBe("web-console");
    });
});
