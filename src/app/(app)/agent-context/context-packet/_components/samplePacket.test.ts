import { describe, expect, it } from "vitest";
import { validateAcrContract } from "@/lib/acr/contracts";
import { SAMPLE_CONTEXT_PACKET } from "./samplePacket";

describe("SAMPLE_CONTEXT_PACKET", () => {
    it("matches the committed context packet contract", () => {
        expect(validateAcrContract("context_packet.v1.schema.json", SAMPLE_CONTEXT_PACKET)).toEqual(
            {
                valid: true,
                errors: [],
            },
        );
    });
});
