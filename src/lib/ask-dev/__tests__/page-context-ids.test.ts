import { describe, expect, it } from "vitest";

import vectorsFile from "@/lib/acr/contracts/examples/context_fabric_canonical_id_vectors.v1.json";
import { validateAcrContract } from "@/lib/acr/contracts";

import { SUBJECT_ID } from "../page-context-ids";

// CHAOS-12280: the ACR id grammar a page states its entities in, pinned to the canonical-id vectors
// ACR generates by executing its own builders (acr #1827, CHAOS-12230), vendored at the web pin. A
// stale vector file fails acr's CI, and a web builder that drifts from ACR's fails here. It replaces
// the earlier oracle of ids parsed back out of scrubbed captures (CHAOS-11938). It pins the grammar
// (prefixes, separators, escapes), not that ops serves ACR's natural keys.
type Vector = {
    readonly kind: string;
    readonly natural_key: Readonly<Record<string, unknown>>;
    readonly canonical_id?: string;
    readonly omitted?: true;
};
const VECTORS = (vectorsFile as { vectors: readonly Vector[] }).vectors;
const text = (value: unknown): string => {
    if (typeof value !== "string")
        throw new Error(`a natural key field is not a string: ${String(value)}`);
    return value;
};

/** How web builds each kind it states, from a natural key named after ACR's source columns. */
const BUILT: Readonly<Record<string, (key: Vector["natural_key"]) => string | null>> = {
    organization: (key) => SUBJECT_ID.organization(text(key.org_id)),
    repository: (key) => SUBJECT_ID.repository(text(key.repo_id)),
    team: (key) => SUBJECT_ID.team(text(key.team_id)),
    pull_request: (key) => SUBJECT_ID.pullRequest(text(key.repo_id), key.number as number),
};
/** The kinds ACR mints that no web page states today (no `SUBJECT_ID` builder). */
const NOT_BUILT = ["work_item", "project"];

describe("the page-context id builder, against ACR's canonical-id vectors", () => {
    it("reads the vendored vectors, which are valid against their vendored schema", () => {
        const verdict = validateAcrContract(
            "context_fabric_canonical_id_vectors.v1.schema.json",
            vectorsFile,
        );
        expect(verdict.errors).toEqual([]);
        expect(verdict.valid).toBe(true);
    });

    it("builds every kind it states, and states no kind it has no vector for", () => {
        // A new SUBJECT_ID builder must join BUILT, and so be checked against ACR's vectors.
        expect(Object.keys(SUBJECT_ID).sort()).toEqual([
            "organization",
            "pullRequest",
            "repository",
            "team",
        ]);
        const kinds = new Set(VECTORS.map((vector) => vector.kind));
        expect([...kinds].sort()).toEqual([...Object.keys(BUILT), ...NOT_BUILT].sort());
        // A comparison that did not happen fails: each kind web builds has a vector.
        for (const kind of Object.keys(BUILT)) {
            expect(VECTORS.filter((vector) => vector.kind === kind).length, kind).toBeGreaterThan(
                0,
            );
        }
    });

    it("builds, byte for byte, the canonical id of every vector of a kind it states", () => {
        const checked = VECTORS.filter((vector) => vector.kind in BUILT);
        expect(checked.length).toBeGreaterThanOrEqual(7);
        for (const vector of checked) {
            // ACR omits only an over-long work_item or project id; none of these kinds is omitted.
            expect(vector.omitted, JSON.stringify(vector)).toBeUndefined();
            expect(BUILT[vector.kind]!(vector.natural_key), JSON.stringify(vector)).toBe(
                vector.canonical_id,
            );
        }
    });
});

describe("SUBJECT_ID", () => {
    it("builds nothing from an empty key, and trims what it is given", () => {
        expect(SUBJECT_ID.organization(undefined)).toBeNull();
        expect(SUBJECT_ID.organization("  ")).toBeNull();
        expect(SUBJECT_ID.organization(" org-1 ")).toBe("organization:org-1");
        expect(SUBJECT_ID.repository(null)).toBeNull();
        expect(SUBJECT_ID.team("")).toBeNull();
        expect(SUBJECT_ID.pullRequest("", 3)).toBeNull();
    });

    it("builds a pull request id only from a positive whole number", () => {
        for (const number of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
            expect(SUBJECT_ID.pullRequest("repo-1", number), String(number)).toBeNull();
        }
        expect(SUBJECT_ID.pullRequest("repo-1", 2911)).toBe("pull_request:repo-1:2911");
    });
});
