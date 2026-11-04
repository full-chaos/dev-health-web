import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { findSites, scan } from "../check-org-provisioning-calls.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "scripts/check-org-provisioning-calls.mjs");
const DIRS = [];

const CLIENT = "src/lib/admin/api/orgs.ts";
const USERS_CLIENT = "src/lib/admin/api/users.ts";
const MEMBER_POST = [
    "export const add = (orgId: string) =>",
    '    request(`/orgs/${orgId}/members`, { method: "POST", body: "{}" });',
].join("\n");
const USERS_DELETE = [
    "export const del = (id: string) =>",
    '    request<void>(`/users/${id}`, { method: "DELETE" });',
].join("\n");

function tree(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "org-prov-"));
    DIRS.push(root);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), text);
    }
    return root;
}

const failures = (files, allowlist = "") => scan(tree(files), allowlist).failures;

afterEach(() => {
    for (const dir of DIRS.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("check-org-provisioning-calls", () => {
    it("passes a clean tree", () => {
        expect(failures({ "src/a.ts": "export const x = 1;" })).toEqual([]);
    });

    it("fails a raw PATCH to /orgs/me outside the client, by file and line", () => {
        const text = 'const r = await fetch(`${base}/api/v1/orgs/me`, {\n  method: "PATCH",\n});';
        expect(failures({ "src/lib/x.ts": text })).toEqual(["FAIL src/lib/x.ts:1 PATCH /orgs/me"]);
    });

    it("passes a GET read of /orgs/me", () => {
        const text = 'await fetch(`${base}/api/v1/orgs/me`, { headers: {}, cache: "no-store" });';
        expect(failures({ "src/lib/x.ts": text })).toEqual([]);
    });

    it("fails an exported createUser", () => {
        const text = "export async function createUser(data: unknown) { return data; }";
        expect(failures({ "src/lib/admin/server/users.ts": text })).toEqual([
            "FAIL src/lib/admin/server/users.ts:1 export createUser",
        ]);
    });

    it("fails a member-route fetch built from a template literal in a component", () => {
        const text = 'fetch(`/api/v1/admin/orgs/${o}/members`, { method: "POST" });';
        const out = failures({ "src/components/M.tsx": text });
        expect(out).toContain("FAIL src/components/M.tsx:1 POST /admin/orgs/{}/members");
        expect(out).toContain("FAIL src/components/M.tsx:1 member route literal");
    });

    it("passes the member route inside the client when its row is listed", () => {
        const allow = `POST /orgs/{}/members\t${CLIENT}\tmember add\n`;
        expect(failures({ [CLIENT]: MEMBER_POST }, allow)).toEqual([]);
    });

    it("fails the same client call when no row lists it", () => {
        expect(failures({ [CLIENT]: MEMBER_POST })).toEqual([
            `FAIL ${CLIENT}:2 POST /orgs/{}/members`,
        ]);
    });

    it("skips test files and __tests__ dirs", () => {
        const text = 'fetch(`/api/v1/admin/orgs/${o}/members`, { method: "POST" });';
        expect(
            failures({ "src/a.test.ts": text, "src/__tests__/b.ts": text, "src/c.spec.tsx": "" }),
        ).toEqual([]);
    });

    it("a row binds to its own file only", () => {
        const allow = `POST /orgs/{}/members\t${CLIENT}\tmember add\n`;
        const out = failures({ [CLIENT]: MEMBER_POST, "src/other.ts": MEMBER_POST }, allow);
        expect(out).toEqual([
            "FAIL src/other.ts:2 POST /orgs/{}/members",
            "FAIL src/other.ts:2 member route literal",
        ]);
    });

    it("fails a stale allowlist row", () => {
        const allow = `POST /orgs/{}/members\t${CLIENT}\tmember add\n`;
        expect(failures({ "src/a.ts": "" }, allow)).toEqual([
            `FAIL stale allowlist row: POST /orgs/{}/members ${CLIENT} (remove it)`,
        ]);
    });

    it("fails closed when there is no src dir", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "org-prov-"));
        DIRS.push(root);
        expect(scan(root, "").failures[0]).toContain("no src dir");
    });

    it("passes an allowlisted /users DELETE in the client file", () => {
        const allow = `DELETE /users/{}\t${USERS_CLIENT}\tuser delete\n`;
        expect(failures({ [USERS_CLIENT]: USERS_DELETE }, allow)).toEqual([]);
    });

    it("fails the same /users DELETE in a component", () => {
        const allow = `DELETE /users/{}\t${USERS_CLIENT}\tuser delete\n`;
        const out = failures(
            { [USERS_CLIENT]: USERS_DELETE, "src/components/D.tsx": USERS_DELETE },
            allow,
        );
        expect(out).toEqual(["FAIL src/components/D.tsx:2 DELETE /users/{}"]);
    });

    it("fails a raw POST /admin/users that no row lists", () => {
        const text = 'fetch(`${base}/api/v1/admin/users`, { method: "POST" });';
        expect(failures({ "src/components/U.tsx": text })).toEqual([
            "FAIL src/components/U.tsx:1 POST /admin/users",
        ]);
    });

    it("fails an unlisted caller of adminApi.users.create", () => {
        const text = "await adminApi.users.create(data, token, orgId);";
        expect(failures({ "src/lib/admin/server/other.ts": text })).toEqual([
            "FAIL src/lib/admin/server/other.ts:1 call adminApi.users.create",
        ]);
    });

    it("fails a non-identity admin write (sync) from a component", () => {
        const text = 'fetch(`${base}/api/v1/admin/sync-configs`, { method: "POST" });';
        expect(failures({ "src/components/S.tsx": text })).toEqual([
            "FAIL src/components/S.tsx:1 POST /admin/sync-configs",
        ]);
    });

    it("fails an unlisted write in a non-identity admin client file, passes once listed", () => {
        const file = "src/lib/admin/api/sync.ts";
        const text =
            'export const t = (id: string) =>\n    request(`/sync-configs/${id}/trigger`, { method: "POST" });';
        expect(failures({ [file]: text })).toEqual([
            `FAIL ${file}:2 POST /sync-configs/{}/trigger`,
        ]);
        expect(
            failures({ [file]: text }, `POST /sync-configs/{}/trigger\t${file}\tsync\n`),
        ).toEqual([]);
    });

    it("reads a request( write in a component as a client write", () => {
        const text = 'request(`/sync-configs/${id}`, { method: "DELETE" });';
        expect(failures({ "src/components/R.tsx": text })).toEqual([
            "FAIL src/components/R.tsx:1 DELETE /sync-configs/{}",
        ]);
    });

    it("the CLI exits 1 on a finding and 0 on a clean tree", () => {
        const bad = tree({
            "src/c/U.tsx": 'fetch(`${b}/api/v1/admin/users`, { method: "POST" });',
        });
        fs.mkdirSync(path.join(bad, "ci"));
        fs.writeFileSync(path.join(bad, "ci/org_provisioning_allowlist.txt"), "");
        const red = spawnSync("node", [SCRIPT, "--root", bad], { encoding: "utf8" });
        expect(red.status).toBe(1);
        expect(red.stderr).toContain("POST /admin/users");
        const good = tree({ "src/a.ts": "" });
        fs.mkdirSync(path.join(good, "ci"));
        fs.writeFileSync(path.join(good, "ci/org_provisioning_allowlist.txt"), "");
        expect(spawnSync("node", [SCRIPT, "--root", good], { encoding: "utf8" }).status).toBe(0);
    });
});

describe("check-org-provisioning-calls: r1 findings", () => {
    const keys = (file, text) => findSites(file, text).map((site) => site.key);
    const pad = `{ a: "${"x".repeat(450)}", method: "POST" }`;

    it("reads the method of request( when a requestBody identifier comes first", () => {
        const text = 'request("/orgs", { body: requestBody, method: "POST" });';
        expect(keys("src/lib/admin/api/new.ts", text)).toEqual(["POST /orgs"]);
    });

    it("reads the method of selfRequest( when a requestBody identifier comes first", () => {
        const text = 'selfRequest("/orgs/me", { body: requestBody, method: "PATCH" });';
        expect(keys("src/lib/admin/api/new.ts", text)).toEqual(["PATCH /orgs/me"]);
    });

    it("reads a method that sits after a 450-character option body", () => {
        expect(keys("src/lib/admin/api/new.ts", `request("/orgs", ${pad});`)).toEqual([
            "POST /orgs",
        ]);
        expect(keys("src/lib/admin/api/new.ts", `selfRequest("/orgs/me", ${pad});`)).toEqual([
            "POST /orgs/me",
        ]);
    });

    it("does not read the method of a later call for a GET request(", () => {
        const text = 'request("/orgs");\nrequest("/teams", { method: "POST" });';
        expect(keys("src/lib/admin/api/new.ts", text)).toEqual(["POST /teams"]);
    });

    it.each([
        ["admin", 'await fetch("/api/v1/admin/users");'],
        ["orgs", 'await fetch("/api/v1/orgs/me");'],
        ["accept-invite", 'await fetch("/api/v1/auth/accept-invite");'],
    ])("passes a %s GET that is followed by an unrelated POST", (_name, get) => {
        const text = `${get}\nawait fetch("/health", { method: "POST" });`;
        expect(keys("src/lib/x.ts", text)).toEqual([]);
    });

    it("still fails the POST that belongs to the raw path", () => {
        const text =
            'await fetch("/health");\nawait fetch("/api/v1/admin/users", { method: "POST" });';
        expect(keys("src/lib/x.ts", text)).toEqual(["POST /admin/users"]);
    });

    it.each([
        ["const", "export const createUser = async () => {};"],
        ["default function", "export default async function createUser() {}"],
        ["export list", "const createUser = async () => {}; export { createUser };"],
        ["renamed export list", "const make = async () => {}; export { make as createUser };"],
        ["default identifier", "const createUser = async () => {}; export default createUser;"],
        ["function", "export async function createUser() {}"],
    ])("refuses an exported createUser (%s)", (_name, text) => {
        expect(keys("src/lib/admin/server/users.ts", text)).toEqual(["export createUser"]);
    });

    it("passes a createUser that is not exported", () => {
        expect(keys("src/lib/admin/server/users.ts", "const createUser = () => 1;")).toEqual([]);
    });

    it("skips .spec test files", () => {
        const text = 'fetch("/api/v1/admin/users", { method: "POST" });';
        expect(failures({ "src/lib/check.spec.ts": text, "src/lib/check.spec.tsx": text })).toEqual(
            [],
        );
    });
});

describe("check-org-provisioning-calls: wrapped options", () => {
    const keys = (file, text) => findSites(file, text).map((site) => site.key);
    const opts = '{ method: "POST" }';
    const wrappers = [
        ["parentheses", `(${opts})`],
        ["as", `${opts} as RequestInit`],
        ["satisfies", `${opts} satisfies RequestInit`],
        ["type assertion", `<RequestInit>${opts}`],
        ["non-null", `${opts}!`],
        ["nested", `((${opts} as RequestInit)!) satisfies RequestInit`],
    ];
    const calls = [
        ["request", (o) => `request("/orgs", ${o});`, "POST /orgs"],
        ["selfRequest", (o) => `selfRequest("/orgs/me", ${o});`, "POST /orgs/me"],
        ["fetch", (o) => `fetch("/api/v1/admin/users", ${o});`, "POST /admin/users"],
    ];
    for (const [callee, build, key] of calls) {
        it.each(wrappers)(`${callee} reads the method through %s`, (_name, wrapped) => {
            expect(keys("src/lib/admin/api/new.ts", build(wrapped))).toEqual([key]);
        });
    }

    it("still reads a GET through a wrapper as no write", () => {
        const text = 'request("/orgs", ({ method: "GET" }) as RequestInit);';
        expect(keys("src/lib/admin/api/new.ts", text)).toEqual([]);
    });
});
