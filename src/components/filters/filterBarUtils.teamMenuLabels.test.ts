import { describe, expect, it } from "vitest";

import { teamMenuLabels } from "./filterBarUtils";

describe("teamMenuLabels", () => {
    it("names by served name, Unresolved when missing, and maps labels back to ids", () => {
        const l = teamMenuLabels(["a", "b", "c"], { a: "Payments", c: "  " }, ["a", "z"]);
        expect(l.all).toEqual(["Payments", "Unresolved", "Unresolved (2)"]);
        expect(l.selected).toEqual(["Payments", "Unresolved (3)"]);
        expect(l.toIds(["Payments", "Unresolved"])).toEqual(["a", "b"]);
    });

    it("keeps a plain value as its own label when the caller says it is a name, and offers labelOf", () => {
        const id = "0b1f6a52-6f0b-4f4e-9d0a-1c2d3e4f5a61";
        const l = teamMenuLabels(["org/web", id], { [id]: "org/api" }, ["org/web"], (v) =>
            v.includes("/"),
        );
        expect(l.all).toEqual(["org/web", "org/api"]);
        expect(l.labelOf(id)).toBe("org/api");
        expect(l.labelOf("org/web")).toBe("org/web");
        expect(l.labelOf("unknown")).toBe("Unresolved");
    });
});
