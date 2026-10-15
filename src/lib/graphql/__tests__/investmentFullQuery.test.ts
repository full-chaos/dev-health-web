import { describe, expect, it } from "vitest";
import { INVESTMENT_FULL_QUERY } from "../queries";

describe("INVESTMENT_FULL_QUERY (CHAOS-9809)", () => {
    it("selects the sizing coverage fields", () => {
        expect(INVESTMENT_FULL_QUERY).toMatch(
            /coverage \{[^}]*sizingCoverage[^}]*unsizedUnitCount/,
        );
    });
});
