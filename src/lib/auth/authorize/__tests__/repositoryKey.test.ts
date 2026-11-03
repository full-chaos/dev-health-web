import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDecision } from "../decision";
import { buildRequestBody } from "../request";

// The cell table of dev-health-acr internal/reposlug/cells.Table (acr main c61aa0bc).
const segment = (n: number) => "a".repeat(n);
interface Cell {
    name: string;
    slug: string;
    valid: boolean;
}
const CELLS: Cell[] = [
    { name: "two segments", slug: "acme/web", valid: true },
    { name: "mixed case", slug: "Acme/Grp/Web", valid: true },
    { name: "three segments", slug: "acme/grp/web", valid: true },
    { name: "twenty segments", slug: "g/".repeat(19) + "x", valid: true },
    { name: "255 bytes", slug: `${segment(100)}/${segment(100)}/${segment(53)}`, valid: true },
    { name: "dot-leading last segment", slug: "acme/grp/.github", valid: true },
    { name: "dots and dashes inside", slug: "acme/g.r_p-1/we.b_2-x", valid: true },
    { name: "21 segments", slug: "g/".repeat(20) + "x", valid: false },
    { name: "256 bytes", slug: `${segment(100)}/${segment(100)}/${segment(54)}`, valid: false },
    {
        name: "256 bytes mixed case",
        slug: `${segment(100).toUpperCase()}/${segment(100)}/${segment(54)}`,
        valid: false,
    },
    { name: "dot segment", slug: "acme/./web", valid: false },
    { name: "dot-dot segment", slug: "acme/../web", valid: false },
    { name: "dot-dot last", slug: "acme/grp/..", valid: false },
    { name: "dot last", slug: "acme/grp/.", valid: false },
    { name: "leading dot group", slug: "acme/.grp/web", valid: false },
    { name: "leading dot owner", slug: ".acme/web", valid: false },
    { name: "101-character group", slug: `acme/${segment(101)}/web`, valid: false },
    { name: "101-character last", slug: `acme/${segment(101)}`, valid: false },
    { name: "one segment", slug: "acme", valid: false },
    { name: "empty", slug: "", valid: false },
    { name: "empty segment", slug: "acme//web", valid: false },
    { name: "trailing slash", slug: "acme/grp/", valid: false },
    { name: "leading slash", slug: "/acme/web", valid: false },
    { name: "wildcard scope", slug: "acme/*", valid: false },
    { name: "wildcard group", slug: "acme/*/web", valid: false },
    { name: "space", slug: "acme/g rp/web", valid: false },
    { name: "newline", slug: "acme/web\n", valid: false },
    { name: "non-ASCII letter", slug: "acme/wéb", valid: false },
    { name: "kelvin sign", slug: "acme/Keep", valid: false },
];

const PRINCIPAL = "principal-reference-0001";
const REQUEST_ID = `req_${"A".repeat(26)}`;
const requestAccepts = (key: string) =>
    buildRequestBody({
        principalReference: PRINCIPAL,
        action: "repository.read",
        resource: { type: "repository", key },
        requestId: REQUEST_ID,
    }) !== null;

const decisionAccepts = (key: string) =>
    parseDecision(
        JSON.stringify({
            schema_version: "authorization_decision.v1",
            decision_id: "dec_EXAMPLE0000000000000000001",
            allowed: true,
            reason_code: "allowed_by_repository_grant",
            principal_id: "prn_EXAMPLE0000000000000001",
            organization_id: "org_EXAMPLE0000000000000001",
            policy_revision: 42,
            expires_at: "2999-06-01T00:00:00Z",
            obligations: { repository_allowlist: [key] },
        }),
        1_800_000_000_000,
    ).ok;

// The web validators take the canonical lowercase key; the schema patterns fold ASCII case.
const canonical = (c: Cell) => c.valid && c.slug === c.slug.toLowerCase();

describe("repository key rule (2-20 segments, 255 bytes)", () => {
    it.each(CELLS)("request key: $name", (c) => {
        expect(requestAccepts(c.slug)).toBe(canonical(c));
    });
    it.each(CELLS)("decision allowlist key: $name", (c) => {
        expect(decisionAccepts(c.slug)).toBe(canonical(c));
    });
    it("keeps the all-repositories wildcard", () => {
        expect(requestAccepts("*")).toBe(true);
        expect(decisionAccepts("*")).toBe(true);
    });
    it("never lets owner/* stand as a key", () => {
        expect(requestAccepts("owner/*")).toBe(false);
        expect(decisionAccepts("owner/*")).toBe(false);
        expect(requestAccepts("owner2/g/x")).toBe(true);
    });
});

// SchemaSlugPattern of dev-health-acr internal/reposlug, unrolled exactly as acr builds it.
function schemaSlugPattern(): string {
    const group = "[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?";
    const last = "(?:[A-Za-z0-9]|[A-Za-z0-9.][A-Za-z0-9._-]{0,98}[A-Za-z0-9])";
    let nest = "";
    for (let i = 0; i < 18; i += 1) nest = `(?:/${group}${nest})?`;
    return `^${group}${nest}/${last}$`;
}

const SCHEMA_ROOT = path.resolve(__dirname, "../../../acr/contracts/schemas");

function walk(node: unknown, hits: Array<Record<string, unknown>>): void {
    if (Array.isArray(node)) {
        for (const v of node) walk(v, hits);
        return;
    }
    if (typeof node !== "object" || node === null) return;
    const o = node as Record<string, unknown>;
    if (typeof o.pattern === "string" && /^\^\[(\^\/|A-Za-z0-9\])/.test(o.pattern)) hits.push(o);
    for (const v of Object.values(o)) walk(v, hits);
}

describe("copied acr schemas hold the acr slug pattern", () => {
    const files = [
        "agent_episode.v1.schema.json",
        "agent_episode_create.v1.schema.json",
        "context_packet.v1.schema.json",
        "context_packet_request.v1.schema.json",
        "device_approval_preview_response.v1.schema.json",
        "device_approval_request.v1.schema.json",
        "device_authorization_request.v1.schema.json",
    ];
    it.each(files)("%s", (file) => {
        const hits: Array<Record<string, unknown>> = [];
        walk(JSON.parse(readFileSync(path.join(SCHEMA_ROOT, file), "utf8")), hits);
        expect(hits.length).toBeGreaterThan(0);
        for (const h of hits) {
            expect(h.pattern).toBe(schemaSlugPattern());
            expect(h.maxLength).toBe(255);
        }
    });
    it("the pattern agrees with every cell", () => {
        const re = new RegExp(schemaSlugPattern());
        for (const c of CELLS) {
            expect(re.test(c.slug) && c.slug.length <= 255, c.name).toBe(c.valid);
        }
    });
});
