import { describe, expect, it } from "vitest";
import { validateAcrContract } from "@/lib/acr/contracts";
import {
    SAMPLE_CONTEXT_PACKET,
    SAMPLE_DEGRADED_CONTEXT_PACKET,
    SAMPLE_PARTIAL_CONTEXT_PACKET,
} from "./samplePacket";

describe("SAMPLE_CONTEXT_PACKET", () => {
    it("matches the committed context packet contract", () => {
        expect(validateAcrContract("context_packet.v1.schema.json", SAMPLE_CONTEXT_PACKET)).toEqual(
            {
                valid: true,
                errors: [],
            },
        );
    });

    it("keeps complete, partial, and degraded coverage fixtures coherent", () => {
        expect(SAMPLE_CONTEXT_PACKET.status).toBe("complete");
        expect(SAMPLE_CONTEXT_PACKET.coverage).toMatchObject({
            partial: false,
            sources_unavailable: [],
            degraded_reasons: [],
        });

        expect(SAMPLE_PARTIAL_CONTEXT_PACKET.status).toBe("partial");
        expect(SAMPLE_PARTIAL_CONTEXT_PACKET.coverage).toMatchObject({
            partial: true,
            sources_unavailable: [
                {
                    source: "clickhouse_work_graph",
                    reason: "Demo fixture does not include hosted ClickHouse",
                },
            ],
            degraded_reasons: [],
        });

        expect(SAMPLE_DEGRADED_CONTEXT_PACKET.status).toBe("degraded");
        expect(SAMPLE_DEGRADED_CONTEXT_PACKET.coverage).toMatchObject({
            partial: true,
            degraded_reasons: ["Hosted evidence is unavailable in this demo fixture."],
        });
    });
});
