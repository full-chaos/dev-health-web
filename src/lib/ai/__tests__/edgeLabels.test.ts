import { describe, expect, it } from "vitest";
import { edgeEndName, edgeEndWords, edgeTypeWords, nodeTypeWords } from "../edgeLabels";

describe("edgeLabels", () => {
    it("maps edge tokens to words, any case", () => {
        expect(edgeTypeWords("has_ai_workflow")).toBe("Has AI workflow");
        expect(edgeTypeWords("DEPLOYS")).toBe("Deploys");
        expect(edgeTypeWords("IS_BLOCKED_BY")).toBe("Blocked by");
    });
    it("makes an unknown token readable, never raw", () => {
        expect(edgeTypeWords("some_new_edge")).toBe("Some new edge");
        expect(nodeTypeWords("custom_node")).toBe("Custom node");
    });
    it("names node types", () => {
        expect(nodeTypeWords("pr")).toBe("PR");
        expect(nodeTypeWords("ai_workflow_run")).toBe("AI workflow run");
    });
});

// CHAOS-8113: an edge has no name fields. The name of an edge end is the served displayName of the
// node with the same type and id. It is a lookup: nothing is read out of the id. The served flag
// `nameExpected` says what a null name means: true = a gap ("Not reported"), false = the type has no
// name by design (the type words stand alone). The web keeps no list of types.
describe("edgeEndName", () => {
    const PR = "11111111-1111-1111-1111-111111111111:42";
    const nodes = [
        { nodeType: "pr", nodeId: PR, displayName: "Add feature flag", nameExpected: true },
        {
            nodeType: "deployment",
            nodeId: "dep-1",
            displayName: "production deploy",
            nameExpected: true,
        },
        { nodeType: "ai_workflow_run", nodeId: "run-1", displayName: null, nameExpected: false },
        {
            nodeType: "review_outcome",
            nodeId: "blank-by-design",
            displayName: "  ",
            nameExpected: false,
        },
        { nodeType: "pr", nodeId: "gap", displayName: null, nameExpected: true },
        { nodeType: "issue", nodeId: "blank", displayName: "   ", nameExpected: true },
        { nodeType: "commit", nodeId: "no-fields" },
        { nodeType: "diff", nodeId: "named", displayName: "A served name", nameExpected: false },
    ];

    it("gives the served name of the node with the same type and id", () => {
        expect(edgeEndName(nodes, "pr", PR)).toEqual({ kind: "name", name: "Add feature flag" });
        expect(edgeEndName(nodes, "deployment", "dep-1")).toEqual({
            kind: "name",
            name: "production deploy",
        });
    });

    it("does not take the name of a node with the same id and another type", () => {
        expect(edgeEndName(nodes, "issue", PR)).toEqual({ kind: "not-reported" });
        expect(edgeEndName(nodes, "pr", "dep-1")).toEqual({ kind: "not-reported" });
    });

    it.each([
        ["a null name", "pr", "gap"],
        ["a blank name", "issue", "blank"],
    ])("a name is expected and %s is served: a gap, 'not reported'", (_name, type, id) => {
        expect(edgeEndName(nodes, type, id)).toEqual({ kind: "not-reported" });
    });

    it.each([
        ["a null name", "ai_workflow_run", "run-1"],
        ["a blank name", "review_outcome", "blank-by-design"],
    ])("no name is expected and %s is served: the type has no name", (_name, type, id) => {
        expect(edgeEndName(nodes, type, id)).toEqual({ kind: "no-name" });
    });

    it("draws a served name also when the flag says the type has none", () => {
        expect(edgeEndName(nodes, "diff", "named")).toEqual({
            kind: "name",
            name: "A served name",
        });
    });

    it("does not say 'no name by design' without the served flag (an older answer): 'not reported'", () => {
        expect(edgeEndName(nodes, "commit", "no-fields")).toEqual({ kind: "not-reported" });
    });

    it("gives 'not reported' for no such node and for an answer with no nodes", () => {
        expect(edgeEndName(nodes, "pr", "missing")).toEqual({ kind: "not-reported" });
        expect(edgeEndName([], "pr", PR)).toEqual({ kind: "not-reported" });
        expect(edgeEndName(undefined, "pr", PR)).toEqual({ kind: "not-reported" });
    });
});

describe("edgeEndWords", () => {
    it("writes the type words and the served name", () => {
        expect(edgeEndWords("pr", { kind: "name", name: "Add feature flag" })).toBe(
            "PR Add feature flag",
        );
    });

    it("writes the type words alone for a type with no name", () => {
        expect(edgeEndWords("ai_workflow_run", { kind: "no-name" })).toBe("AI workflow run");
        expect(edgeEndWords("review_outcome", { kind: "no-name" })).toBe("Review outcome");
    });

    it("writes 'Not reported' after the type words for a gap", () => {
        expect(edgeEndWords("pr", { kind: "not-reported" })).toBe("PR Not reported");
    });
});
