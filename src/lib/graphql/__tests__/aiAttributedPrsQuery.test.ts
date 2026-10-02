import { describe, expect, it } from "vitest";

import { AI_ATTRIBUTED_PRS_QUERY } from "../queries";

// CHAOS-7982: the aiAttributedPrs read asks for exactly these row fields. A change to the list is a
// contract change and must be deliberate (the names arrive from the Go API with CHAOS-7773).
function rowFields(query: string): string[] {
    const match = query.match(/rows\s*\{([^}]*)\}/);
    return (match?.[1] ?? "").split(/\s+/).filter(Boolean);
}

describe("AI_ATTRIBUTED_PRS_QUERY", () => {
    it("asks for the row fields the evidence list reads", () => {
        expect(rowFields(AI_ATTRIBUTED_PRS_QUERY)).toEqual([
            "repoId",
            "number",
            "title",
            "kind",
            "workType",
            "teamId",
            "mergedAt",
        ]);
    });

    it("keeps the paging variables and the result envelope", () => {
        expect(AI_ATTRIBUTED_PRS_QUERY).toContain("$limit: Int! = 50");
        expect(AI_ATTRIBUTED_PRS_QUERY).toContain("$offset: Int! = 0");
        for (const f of ["total", "hasMore", "dataAvailable"]) {
            expect(AI_ATTRIBUTED_PRS_QUERY).toContain(f);
        }
    });
});
