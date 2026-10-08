import { describe, expect, it } from "vitest";

import { teamMenuLabels } from "./filterBarUtils";

describe("teamMenuLabels", () => {
    it("names by served name, Unresolved when missing, and maps labels back to ids", () => {
        const l = teamMenuLabels(["a", "b", "c"], { a: "Payments", c: "  " }, ["a", "z"]);
        expect(l.all).toEqual(["Payments", "Unresolved", "Unresolved (2)"]);
        expect(l.selected).toEqual(["Payments", "Unresolved (3)"]);
        expect(l.toIds(["Payments", "Unresolved"])).toEqual(["a", "b"]);
    });
});
