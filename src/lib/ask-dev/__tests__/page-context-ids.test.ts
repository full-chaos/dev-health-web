import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SUBJECT_ID } from "../page-context-ids";

// CHAOS-11938: the ACR id grammar a page states its entities in. A fixture oracle from real producer
// output: every id of these kinds that ACR wrote in the scrubbed kiac/encoder captures is parsed by
// ACR's grammar into its natural key and built again here, byte for byte. It pins the grammar (the
// prefixes and separators), not that ops serves ACR's natural keys; CHAOS-12230 replaces it with
// vectors ACR generates by executing its own builders. No capture holds an organization subject,
// so `organization:<org id>` is NOT pinned here: it is argued from ACR's two producers
// (`directread/subject_lookup.go` ownOrganizationResponse, `devhealthsource/clickhouse.go`) only.
const CAPTURES = join(process.cwd(), "src/components/ask-dev/answer/__tests__/captures");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function captureIds(): Map<string, Set<string>> {
    const byKind = new Map<string, Set<string>>();
    const walk = (node: unknown): void => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (node === null || typeof node !== "object") return;
        const record = node as Record<string, unknown>;
        if (typeof record.kind === "string" && typeof record.canonical_id === "string") {
            const ids = byKind.get(record.kind) ?? new Set<string>();
            ids.add(record.canonical_id);
            byKind.set(record.kind, ids);
        }
        Object.values(record).forEach(walk);
    };
    for (const file of readdirSync(CAPTURES).filter((name) => name.endsWith(".json"))) {
        walk(JSON.parse(readFileSync(join(CAPTURES, file), "utf8")));
    }
    return byKind;
}

describe("the ACR id grammar, against every id ACR wrote in the captures", () => {
    const ids = captureIds();
    const of = (kind: string) => [...(ids.get(kind) ?? [])];

    it("finds ids of each kind to compare (a comparison that did not happen fails)", () => {
        expect(of("repository").length).toBeGreaterThan(3);
        expect(of("team").length).toBeGreaterThan(0);
        expect(of("pull_request").length).toBeGreaterThan(3);
    });

    it("repository: `repository:` + the repository uuid", () => {
        for (const id of of("repository")) {
            const repoId = id.slice("repository:".length);
            expect(repoId, id).toMatch(UUID);
            expect(SUBJECT_ID.repository(repoId)).toBe(id);
        }
    });

    it("pull request: `pull_request:` + the repository uuid + `:` + the number", () => {
        for (const id of of("pull_request")) {
            const match = /^pull_request:([^:]+):(\d+)$/u.exec(id);
            expect(match, id).not.toBeNull();
            const [, repoId = "", number = ""] = match ?? [];
            expect(repoId, id).toMatch(UUID);
            expect(SUBJECT_ID.pullRequest(repoId, Number(number))).toBe(id);
        }
    });

    it("team: `team:` + the team id, which keeps its own colons (`linear:TEAMA`)", () => {
        for (const id of of("team")) {
            const teamId = id.slice("team:".length);
            expect(teamId, id).not.toBe("");
            expect(SUBJECT_ID.team(teamId)).toBe(id);
        }
        expect(of("team")).toContain("team:linear:TEAMA");
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
