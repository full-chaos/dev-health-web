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

    it("rejects malformed renderer-required nested packet fields", () => {
        expect(
            isContextPacket({
                ...SAMPLE_CONTEXT_PACKET,
                freshness: { ...SAMPLE_CONTEXT_PACKET.freshness, watermarks: null },
            }),
        ).toBe(false);
        expect(
            isContextPacket({
                ...SAMPLE_CONTEXT_PACKET,
                items: [
                    {
                        ...SAMPLE_CONTEXT_PACKET.items[0],
                        confidence: Number.NaN,
                        related_entities: [{ id: "entity", label: "Entity" }],
                    },
                ],
            }),
        ).toBe(false);
        expect(
            isContextPacket({
                ...SAMPLE_CONTEXT_PACKET,
                coverage: { ...SAMPLE_CONTEXT_PACKET.coverage, sources_unavailable: [{}] },
            }),
        ).toBe(false);
        expect(
            isContextPacket({
                ...SAMPLE_CONTEXT_PACKET,
                required_checks: [{ check_id: "check" }],
            }),
        ).toBe(false);
    });

    it("rejects malformed renderer-required expanded evidence fields", () => {
        const evidence = Object.values(SAMPLE_EXPANDED_EVIDENCE)[0];
        expect(
            isExpandedEvidence({
                ...evidence,
                evidence: {
                    ...evidence.evidence,
                    source: { display_label: "Missing source fields" },
                },
            }),
        ).toBe(false);
        expect(
            isExpandedEvidence({
                ...evidence,
                evidence: { ...evidence.evidence, confidence: Infinity },
            }),
        ).toBe(false);
    });

    it("rejects non-canonical categories and malformed renderer timestamps", () => {
        expect(
            isContextPacket({
                ...SAMPLE_CONTEXT_PACKET,
                items: [{ ...SAMPLE_CONTEXT_PACKET.items[0], category: "unsupported" }],
            }),
        ).toBe(false);
        expect(
            isContextPacket({
                ...SAMPLE_CONTEXT_PACKET,
                generated_at: "2026-02-30T12:00:00Z",
            }),
        ).toBe(false);
        expect(
            isContextPacket({
                ...SAMPLE_CONTEXT_PACKET,
                freshness: { ...SAMPLE_CONTEXT_PACKET.freshness, as_of: "not-a-timestamp" },
            }),
        ).toBe(false);
        expect(
            isExpandedEvidence({
                ...Object.values(SAMPLE_EXPANDED_EVIDENCE)[0],
                resolved_at: "2026-01-01",
            }),
        ).toBe(false);
    });
});
