import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBatch, parseDecision } from "../decision";
import { buildRequestBody, type AuthorizeRequest, type ResourceType } from "../request";

// The corpus is owned by dev-health-ops and arrives through the pinned sparse checkout
// (ci/ops-contract.pin). WEB_REQUIRE_ACCESS_TOKEN_CORPUS=1 (the CI gate tier) turns a missing
// checkout into a failure; a bare local run skips loudly.
const contractRoot = process.env.WEB_OPS_CONTRACT_ROOT ?? "";
const required = process.env.WEB_REQUIRE_ACCESS_TOKEN_CORPUS === "1";
const suite = contractRoot !== "" || required ? describe : describe.skip;

const v1 = path.join(contractRoot, "contracts/auth/v1");
const examples = path.join(v1, "examples");
const goldenDir = path.join(v1, "golden/decision");

// The fixtures' clock: the examples expire on 2026-09-03T05:00:30Z.
const FIXTURE_NOW = Date.parse("2026-09-03T05:00:00Z");

interface Row {
    file: string;
}
interface Manifest {
    accept: Row[];
    reject?: Row[];
    reject_by_client?: Row[];
    request?: { requests: unknown[] };
}

const text = (p: string) => readFileSync(p, "utf8");
const manifest = (dir: string): Manifest =>
    contractRoot === ""
        ? { accept: [] }
        : (JSON.parse(text(path.join(examples, dir, "manifest.json"))) as Manifest);

suite("pinned contract checkout", () => {
    it("is named", () => {
        expect(contractRoot).not.toBe("");
    });
});

suite("authorization_decision.v1 examples", () => {
    const m = manifest("authorization_decision");
    it.each(m.accept.map((r) => r.file))("accepts %s", (file) => {
        const r = parseDecision(
            text(path.join(examples, "authorization_decision", file)),
            FIXTURE_NOW,
        );
        expect(r.ok).toBe(true);
    });
    it.each([...(m.reject ?? []), ...(m.reject_by_client ?? [])].map((r) => r.file))(
        "refuses %s",
        (file) => {
            const r = parseDecision(
                text(path.join(examples, "authorization_decision", file)),
                FIXTURE_NOW,
            );
            expect(r.ok).toBe(false);
        },
    );
});

suite("authorization_batch_response.v1 examples", () => {
    const m = manifest("authorization_batch_response");
    const count = m.request?.requests.length ?? -1;
    it("knows the request size", () => {
        expect(count).toBeGreaterThan(0);
    });
    it.each(m.accept.map((r) => r.file))("accepts %s", (file) => {
        const t = text(path.join(examples, "authorization_batch_response", file));
        expect(parseBatch(t, count, FIXTURE_NOW).ok).toBe(true);
    });
    it.each([...(m.reject ?? []), ...(m.reject_by_client ?? [])].map((r) => r.file))(
        "refuses %s",
        (file) => {
            const t = text(path.join(examples, "authorization_batch_response", file));
            expect(parseBatch(t, count, FIXTURE_NOW).ok).toBe(false);
        },
    );
});

suite("authorization_request.v1 examples", () => {
    const m = manifest("authorization_request");
    it.each(m.accept.map((r) => r.file))("builds the accepted request %s byte for byte", (file) => {
        const wire = JSON.parse(text(path.join(examples, "authorization_request", file))) as {
            principal_reference: string;
            action: string;
            resource: { type: ResourceType; key: string; organization_id?: string };
            context: { request_id: string };
        };
        const req: AuthorizeRequest = {
            principalReference: wire.principal_reference,
            action: wire.action,
            resource: {
                type: wire.resource.type,
                key: wire.resource.key,
                ...(wire.resource.organization_id
                    ? { organizationId: wire.resource.organization_id }
                    : {}),
            },
            requestId: wire.context.request_id,
        };
        expect(buildRequestBody(req)).toEqual(wire);
    });
});

// golden/decision: Go runs the pdp and pep rows; this client pins the same files by DIGEST
// (algorithm: golden/decision/README.md).
function digestOf(dir: string): string {
    const rels: string[] = [];
    const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
            const abs = path.join(d, e.name);
            if (e.isDirectory()) walk(abs);
            else rels.push(path.relative(dir, abs).split(path.sep).join("/"));
        }
    };
    walk(dir);
    const h = createHash("sha256");
    for (const rel of rels
        .filter((r) => r !== "DIGEST")
        .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
        const bytes = readFileSync(path.join(dir, rel));
        h.update(
            Buffer.concat([Buffer.from(`${rel}\n${bytes.length}\n`), bytes, Buffer.from("\n")]),
        );
    }
    return `sha256:${h.digest("hex")}\n`;
}

suite("golden/decision pin", () => {
    it("the directory digest is the pinned one", () => {
        const pinned = text(path.join(__dirname, "testdata/decision-golden.digest"));
        expect(digestOf(goldenDir)).toBe(pinned);
        expect(text(path.join(goldenDir, "DIGEST"))).toBe(pinned);
    });
    it("the manifest claims exactly the vector and catalog files on disk", () => {
        const m = JSON.parse(text(path.join(goldenDir, "manifest.json"))) as {
            vectors: { file: string }[];
            catalogs: { file: string }[];
        };
        const onDisk = (sub: string) =>
            readdirSync(path.join(goldenDir, sub))
                .map((f) => `${sub}/${f}`)
                .sort();
        expect(m.vectors.map((r) => `vectors/${r.file}`).sort()).toEqual(onDisk("vectors"));
        expect(m.catalogs.map((r) => r.file).sort()).toEqual(onDisk("catalogs"));
    });
});
