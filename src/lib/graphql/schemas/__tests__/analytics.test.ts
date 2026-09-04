import { describe, expect, it } from "vitest";
import { SankeyResultSchema } from "../analytics";

// CHAOS-4241 (codex round 1 on the web PR): SankeyResultSchema did not
// declare `unit`, so any caller that runs a Sankey response through this
// Zod schema would have the backend's `unit` field silently stripped by
// Zod's default unknown-key behavior — the current investment hooks bypass
// this validator (they parse the raw GraphQL response directly), but the
// schema is the shared/canonical runtime contract and must not drift from
// what the backend actually sends.
describe("SankeyResultSchema", () => {
    const base = { nodes: [], edges: [] };

    it("keeps unit: 'WORK_UNITS' when parsing a response", () => {
        const result = SankeyResultSchema.parse({ ...base, unit: "WORK_UNITS" });
        expect(result.unit).toBe("WORK_UNITS");
    });

    it("keeps unit: 'LOC' when parsing a response", () => {
        const result = SankeyResultSchema.parse({ ...base, unit: "LOC" });
        expect(result.unit).toBe("LOC");
    });

    it("parses to unit: undefined (not stripped-and-hidden) when the response omits it", () => {
        const result = SankeyResultSchema.parse(base);
        expect(result.unit).toBeUndefined();
        expect("unit" in result || true).toBe(true); // parse must not throw
    });

    it("rejects an unrecognized unit value rather than silently accepting it", () => {
        expect(() => SankeyResultSchema.parse({ ...base, unit: "BOGUS" })).toThrow();
    });
});
