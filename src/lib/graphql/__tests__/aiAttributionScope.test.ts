import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-7744 premise: the Attribution page's query scope has no `workType`, so the page cannot
 * apply the Work control. If the backend adds it, this test fails and the page can read it again.
 */
const generated = readFileSync(
    join(process.cwd(), "src/lib/graphql/__generated__/types.ts"),
    "utf8",
);
const block = (name: string) =>
    generated.match(new RegExp(`export type ${name} = \\{([^}]*)\\}`, "u"))?.[1] ?? "";

describe("AI query scopes", () => {
    it("AIAttributionScopeInput has no workType; AIScopeInput has", () => {
        expect(block("AiAttributionScopeInput")).not.toContain("workType");
        expect(block("AiAttributionScopeInput")).toContain("teamId");
        expect(block("AiScopeInput")).toContain("workType");
    });
});
