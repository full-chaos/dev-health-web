import { describe, expect, it } from "vitest";

import { teamMenuLabels, teamScopeLabels } from "./filterBarUtils";

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

describe("teamMenuLabels with bare and provider-prefixed team ids (CHAOS-8939)", () => {
    const UUID = "0b1f6a52-6f0b-4f4e-9d0a-1c2d3e4f5a61";

    it.each([
        ["jira:<uuid>", `jira:${UUID}`],
        ["linear:KEY", "linear:ENG"],
        ["bare uuid", UUID],
    ])("names a %s team by its served name and maps the label back to the id", (_form, id) => {
        const l = teamMenuLabels([id], { [id]: "Platform" }, [id]);
        expect(l.all).toEqual(["Platform"]);
        expect(l.selected).toEqual(["Platform"]);
        expect(l.toIds(["Platform"])).toEqual([id]);
    });

    it("keeps the bare and the prefixed row of one team apart in the carry window", () => {
        const bare = UUID;
        const prefixed = `jira:${UUID}`;
        const l = teamMenuLabels([bare, prefixed], { [bare]: "Platform", [prefixed]: "Platform" }, [
            prefixed,
        ]);
        expect(l.all).toEqual(["Platform", "Platform (2)"]);
        expect(l.selected).toEqual(["Platform (2)"]);
        expect(l.toIds(["Platform (2)"])).toEqual([prefixed]);
    });

    it("shows Unresolved, never the prefixed id, when no name is served", () => {
        const id = `jira:${UUID}`;
        const l = teamMenuLabels([id], {}, [id]);
        expect(l.all).toEqual(["Unresolved"]);
        expect(l.labelOf(id)).toBe("Unresolved");
    });
});

describe("teamScopeLabels (CHAOS-9028)", () => {
    const names = { a: "Payments", b: "Platform" };
    const ids = ["x1", "a", "unassigned", "x2", "b", "x3"];

    it("lists named teams, then unassigned last; no unnamed id is a row", () => {
        const l = teamScopeLabels(ids, names, []);
        expect(l.all).toEqual(["Payments", "Platform", "Unassigned team"]);
        expect(l.selected).toEqual([]);
        expect(l.toIds(["Platform", "Unassigned team"])).toEqual(["b", "unassigned"]);
    });

    it("shows one unnumbered Unresolved state for one selected unnamed id", () => {
        const l = teamScopeLabels(ids, names, ["x1", "a"]);
        expect(l.all).not.toContain("Unresolved");
        expect(l.selected).toEqual(["Payments", "Unresolved"]);
        expect(l.labelOf("x1")).toBe("Unresolved");
    });

    it("shows one Unresolved state, no number, for two selected unnamed ids, and keeps both ids", () => {
        const l = teamScopeLabels(ids, names, ["x1", "x2"]);
        expect(l.selected).toEqual(["Unresolved"]);
        expect(l.toIds(["Unresolved", "Platform"])).toEqual(["b", "x1", "x2"]);
        expect(l.toIds([])).toEqual([]);
    });

    it("shows a selected unnamed id that the list does not hold as Unresolved, never the id", () => {
        const l = teamScopeLabels(["a"], names, ["old-link-id"]);
        expect(l.selected).toEqual(["Unresolved"]);
        expect(JSON.stringify([l.all, l.selected])).not.toContain("old-link-id");
    });

    it("labels unassigned with the unassigned-work label even when a name is served", () => {
        const l = teamScopeLabels(["unassigned"], { unassigned: "  " }, ["unassigned"]);
        expect(l.all).toEqual(["Unassigned team"]);
        expect(l.selected).toEqual(["Unassigned team"]);
    });

    it("keeps today's numbering for two named teams that share a name", () => {
        const l = teamScopeLabels(["p", "q"], { p: "Platform", q: "Platform" }, ["q"]);
        expect(l.all).toEqual(["Platform", "Platform (2)"]);
        expect(l.selected).toEqual(["Platform (2)"]);
    });
});
