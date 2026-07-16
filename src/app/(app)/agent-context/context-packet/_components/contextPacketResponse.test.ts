import { describe, expect, it } from "vitest";
import { SAMPLE_CONTEXT_PACKET, SAMPLE_EXPANDED_EVIDENCE } from "./samplePacket";
import { isContextPacket, isExpandedEvidence } from "./contextPacketResponse";

describe("context packet response validation", () => {
    it("accepts packet and evidence payloads without importing the Ajv runtime", () => {
        expect(isContextPacket(SAMPLE_CONTEXT_PACKET)).toBe(true);
        expect(isExpandedEvidence(Object.values(SAMPLE_EXPANDED_EVIDENCE)[0])).toBe(true);
    });

    it("rejects malformed display-critical packet and evidence payloads", () => {
        expect(isContextPacket({ ...SAMPLE_CONTEXT_PACKET, items: [{}] })).toBe(false);
        expect(
            isExpandedEvidence({ ...Object.values(SAMPLE_EXPANDED_EVIDENCE)[0], evidence: {} }),
        ).toBe(false);
    });
});
