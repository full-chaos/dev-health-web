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

describe("check-org-provisioning-calls: r1f findings", () => {
    const keys = (file, text) => findSites(file, text).map((site) => site.key);
    const write = [
        'fetch(`/api/v1/admin/users`, { method: "POST" });',
        'request(`/orgs/${orgId}/members`, { method: "POST" });',
        "const memberRoute = `/orgs/${orgId}/members`;",
        "export function createUser() {}",
        "adminApi.users.create(data, token, orgId);",
    ].join("\n");
    const writeKeys = [
        "POST /admin/users",
        "POST /orgs/{}/members",
        "member route literal",
        "member route literal",
        "export createUser",
        "call adminApi.users.create",
    ];
    const member = "`/orgs/${orgId}/members`";

    it.each(["ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts"])(
        "scans a .%s source file for every write form",
        (ext) => {
            const out = failures({ [`src/w.${ext}`]: write }).map((line) =>
                line.split(" ").slice(2),
            );
            expect(out.map((parts) => parts.join(" ")).sort()).toEqual([...writeKeys].sort());
        },
    );

    it("reads JSX syntax in .jsx and .tsx files", () => {
        const text =
            'const a = <b onClick={() => fetch("/api/v1/admin/users", { method: "POST" })} />;';
        expect(keys("src/c.jsx", text)).toEqual(["POST /admin/users"]);
        expect(keys("src/c.tsx", text)).toEqual(["POST /admin/users"]);
    });

    it.each(["js", "jsx", "mjs", "cjs", "mts", "cts"])(
        "skips .test.%s and .spec.%s files",
        (ext) => {
            expect(
                failures({ [`src/w.test.${ext}`]: write, [`src/w.spec.${ext}`]: write }),
            ).toEqual([]);
        },
    );

    it("refuses a route literal that follows a comment with the same text", () => {
        const text = `// example path: /orgs/\${orgId}/members\nconst memberRoute = ${member};`;
        expect(keys("src/example.ts", text)).toEqual(["member route literal"]);
        expect(findSites("src/example.ts", text)[0].line).toBe(2);
    });

    it("refuses every member route literal in a file, one finding each", () => {
        const text = `const a = ${member};\nconst b = ${member};\nconst c = 1;\nconst d = ${member};`;
        expect(findSites("src/example.ts", text).map((site) => site.line)).toEqual([1, 2, 4]);
    });

    it("passes an inline comment after code that holds no route literal", () => {
        expect(
            keys("src/example.ts", `const label = 1; // docs route /orgs/\${orgId}/members`),
        ).toEqual([]);
    });

    it("passes route text in a block comment, a JSDoc line and a trailing block comment", () => {
        const text = [
            "/* /orgs/${orgId}/members */",
            "/**",
            " * see /orgs/${orgId}/invites",
            " */",
            "const x = 1; /* /orgs/${orgId}/transfer-ownership */",
        ].join("\n");
        expect(keys("src/example.ts", text)).toEqual([]);
    });

    it("refuses a route literal that follows a block comment on the same line", () => {
        const text = `/* note */ const r = ${member};`;
        expect(keys("src/example.ts", text)).toEqual(["member route literal"]);
    });

    it("refuses a route literal in a plain string and passes the client file", () => {
        expect(keys("src/example.ts", 'const r = "/orgs/abc/invites";')).toEqual([
            "member route literal",
        ]);
        expect(keys("src/lib/admin/api/orgs.ts", `const r = ${member};`)).toEqual([]);
    });
});

describe("check-org-provisioning-calls: r1 (pm) classes on the AST", () => {
    const keys = (file, text) => findSites(file, text).map((site) => site.key);
    const NEW = "src/lib/admin/api/new.ts";
    const methodWrappers = [
        ["parentheses", '("POST")'],
        ["as const", '"POST" as const'],
        ["satisfies", '"POST" satisfies string'],
        ["type assertion", '<string>"POST"'],
        ["non-null", '"POST"!'],
        ["nested", '(("POST" as const)!) satisfies string'],
        ["lower case", '"post"'],
        ["template literal", "`POST`"],
    ];
    const callBuilders = [
        ["request", (m) => `request("/orgs", { method: ${m} });`, "POST /orgs"],
        ["selfRequest", (m) => `selfRequest("/orgs/me", { method: ${m} });`, "POST /orgs/me"],
        ["fetch", (m) => `fetch("/api/v1/admin/users", { method: ${m} });`, "POST /admin/users"],
    ];
    for (const [callee, build, key] of callBuilders) {
        it.each(methodWrappers)(`${callee} reads a method value wrapped as %s`, (_n, method) => {
            expect(keys(NEW, build(method))).toEqual([key]);
        });
    }

    it.each([
        ["identifier", 'request("/orgs", { method: verb });', "UNKNOWN /orgs"],
        ["shorthand", 'request("/orgs", { method });', "UNKNOWN /orgs"],
        ["call", 'selfRequest("/orgs/me", { method: pick() });', "UNKNOWN /orgs/me"],
        ["spread after", 'request("/orgs", { method: "GET", ...init });', "UNKNOWN /orgs"],
        ["options identifier", 'request("/orgs", init);', "UNKNOWN /orgs"],
        ["raw fetch", 'fetch("/api/v1/orgs/me", { method: verb });', "UNKNOWN /orgs/me"],
    ])("flags a method that is not a literal (%s)", (_n, text, key) => {
        expect(keys(NEW, text)).toEqual([key]);
    });

    it("keeps a literal GET and a spread before the method as the literal says", () => {
        expect(keys(NEW, 'request("/orgs", { method: "GET" });')).toEqual([]);
        expect(keys(NEW, 'request("/orgs");')).toEqual([]);
        expect(keys(NEW, 'request("/orgs", { ...init, method: "GET" });')).toEqual([]);
        expect(keys(NEW, 'request("/orgs", { ...init, method: "POST" });')).toEqual(["POST /orgs"]);
        expect(keys(NEW, 'fetch("/api/v1/orgs/me", { method: "HEAD" });')).toEqual([]);
    });

    it.each([
        ["collection root", 'fetch("/api/v1/orgs", { method: "POST" });', "POST /orgs"],
        ["root with slash", 'fetch("/api/v1/orgs/", { method: "POST" });', "POST /orgs"],
        ["root with query", 'fetch("/api/v1/orgs?x=1", { method: "PUT" });', "PUT /orgs"],
        ["template root", 'fetch(`${base}/api/v1/orgs`, { method: "POST" });', "POST /orgs"],
        ["admin root", 'fetch("/api/v1/admin", { method: "DELETE" });', "DELETE /admin"],
        [
            "accept-invite",
            'fetch("/api/v1/auth/accept-invite", { method: "POST" });',
            "POST /auth/accept-invite",
        ],
    ])("refuses a raw write to the %s", (_n, text, key) => {
        expect(keys("src/lib/x.ts", text)).toEqual([key]);
    });

    it("does not read a sibling name as the org namespace", () => {
        expect(keys("src/lib/x.ts", 'fetch("/api/v1/orgsx", { method: "POST" });')).toEqual([]);
        expect(keys("src/lib/x.ts", 'fetch("/api/v1/organizations", { method: "POST" });')).toEqual(
            [],
        );
    });

    it("reads a member route with a nested interpolation, outside and inside the client", () => {
        const lit = "const r = `/orgs/${getOrgId({ orgId })}/members`;";
        expect(keys("src/example.ts", lit)).toEqual(["member route literal"]);
        const call = 'request(`/orgs/${getOrgId({ orgId })}/members`, { method: "POST" });';
        expect(keys(CLIENT, call)).toEqual(["POST /orgs/{}/members"]);
        expect(
            failures({ [CLIENT]: call }, `POST /orgs/{}/members\t${CLIENT}\tmember add\n`),
        ).toEqual([]);
    });

    it.each([
        ["escaped slashes", 'const r = "\\/orgs\\/abc\\/members";'],
        ["unicode slashes", 'const r = "\\u002forgs\\u002fabc\\u002fmembers";'],
        ["hex slashes", 'const r = "\\x2forgs\\x2fabc\\x2finvites";'],
        ["template escapes", "const r = `\\/orgs\\/${id}\\/transfer-ownership`;"],
        ["concatenation", 'const r = "/orgs/" + id + "/members";'],
        ["partial concatenation", 'const r = `/orgs/${a}` + "/invites";'],
    ])("refuses a member route that is written with %s", (_n, text) => {
        expect(keys("src/example.ts", text)).toEqual(["member route literal"]);
    });

    it("reads a client call whose path is a concatenation, and a raw path joined by +", () => {
        expect(keys(NEW, 'request("/orgs/" + id + "/members", { method: "POST" });')).toEqual([
            "POST /orgs/{}/members",
            "member route literal",
        ]);
        expect(keys("src/lib/x.ts", 'fetch(base + "/api/v1/orgs", { method: "POST" });')).toEqual([
            "POST /orgs",
        ]);
    });

    it.each([
        ["property access request", 'client.request("/orgs", { method: "POST" });', "POST /orgs"],
        ["window.fetch", 'window.fetch("/api/v1/orgs", { method: "POST" });', "POST /orgs"],
        ["comma callee", '(0, fetch)("/api/v1/orgs", { method: "POST" });', "POST /orgs"],
        ["new Request", 'new Request("/api/v1/orgs", { method: "POST" });', "POST /orgs"],
        [
            "conditional path",
            'fetch(ok ? "/api/v1/orgs" : "/health", { method: "POST" });',
            "POST /orgs",
        ],
        ["parenthesized path", 'request(("/orgs"), { method: "POST" });', "POST /orgs"],
        ["generic call", 'request<Org>("/orgs", { method: "POST" });', "POST /orgs"],
    ])("reads %s", (_n, text, key) => {
        expect(keys(NEW, text)).toEqual([key]);
    });

    it.each([
        ["parenthesized default", "const createUser = 1; export default (createUser);"],
        ["nested default", "const createUser = 1; export default ((createUser) as any);"],
        ["destructured const", "export const { createUser } = api;"],
        ["destructured rename", "export const { make: createUser } = api;"],
        ["destructured rest", "export const { ...createUser } = api;"],
        ["array destructure", "export const [createUser] = api;"],
        ["nested destructure", "export const { a: [{ createUser }] } = api;"],
        ["export class", "export class createUser {}"],
        ["default object", "const createUser = 1; export default { createUser };"],
        ["re-export", 'export { createUser } from "./users";'],
        ["namespace re-export", 'export * as createUser from "./users";'],
        ["export equals", "const createUser = 1; export = createUser;"],
    ])("refuses an exported createUser (%s)", (_n, text) => {
        expect(keys("src/lib/admin/server/users.ts", text)).toEqual(["export createUser"]);
    });

    it.each([
        ["exports.", "exports.createUser = () => 1;"],
        ["module.exports.", "module.exports.createUser = () => 1;"],
        ["module.exports object", "const createUser = () => 1; module.exports = { createUser };"],
        ["module.exports identifier", "const createUser = () => 1; module.exports = createUser;"],
    ])("refuses a CommonJS createUser export (%s)", (_n, text) => {
        expect(keys("src/lib/admin/server/users.cjs", text)).toEqual(["export createUser"]);
    });

    it("passes a createUser that is only imported or declared", () => {
        const text =
            'import { createUser } from "./x"; const own = { createUser }; export const a = 1;';
        expect(keys("src/lib/admin/server/users.ts", text)).toEqual([]);
    });

    it.each([
        ["optional chain", "adminApi.users?.create(data, token);"],
        ["element access", 'adminApi["users"].create(data, token);'],
        ["wrapped callee", "(adminApi.users.create)(data, token);"],
        ["non-null callee", "adminApi.users!.create(data, token);"],
    ])("refuses an adminApi.users.create call written with %s", (_n, text) => {
        expect(keys("src/lib/x.ts", text)).toEqual(["call adminApi.users.create"]);
    });
});

const keysOf = (rel, text) => findSites(rel, text).map((s) => s.key);

describe("check-org-provisioning-calls: D6690 contract, site rule (any callee)", () => {
    const PATHS = {
        admin: ["/api/v1/admin/users", "POST /admin/users"],
        orgs: ["/api/v1/orgs", "POST /orgs"],
        invite: ["/api/v1/auth/accept-invite", "POST /auth/accept-invite"],
    };
    const SHAPES = {
        call: (p, o) => `writeRequest("${p}", ${o});`,
        property: (p, o) => `transport.send("${p}", ${o});`,
        new: (p, o) => `new WriteRequest("${p}", ${o});`,
        comma: (p, o) => `(0, transport.send)("${p}", ${o});`,
        deadline: (p, o) => `fetchWithDeadline(\`\${baseUrl}${p}\`, ${o}, { kind: "write" });`,
    };

    for (const [family, [route, key]] of Object.entries(PATHS)) {
        for (const [shape, build] of Object.entries(SHAPES)) {
            it(`refuses an unknown method on ${family} through ${shape}`, () => {
                const text = build(route, "{ method }");
                expect(keysOf("src/probe.ts", text)).toEqual([key.replace("POST", "UNKNOWN")]);
            });
            it(`refuses a literal POST on ${family} through ${shape}`, () => {
                const text = build(route, '{ method: "POST" }');
                expect(keysOf("src/probe.ts", text)).toEqual([key]);
            });
            it(`passes a GET on ${family} through ${shape}`, () => {
                expect(keysOf("src/probe.ts", build(route, '{ method: "GET" }'))).toEqual([]);
            });
        }
    }

    it("reads the method from a later object argument", () => {
        const text = 'send("/api/v1/orgs", token, { method: "DELETE" });';
        expect(keysOf("src/probe.ts", text)).toEqual(["DELETE /orgs"]);
    });

    it("passes a protected path with no options argument (GET)", () => {
        expect(keysOf("src/probe.ts", 'read("/api/v1/orgs/me");')).toEqual([]);
    });

    it("finds the protected path in a later argument", () => {
        const text = 'send(init, "/api/v1/orgs", { method: "PUT" });';
        expect(keysOf("src/probe.ts", text)).toEqual(["PUT /orgs"]);
    });
});

describe("check-org-provisioning-calls: D6690 contract, anchored path", () => {
    const post = (url) => `fetch(${JSON.stringify(url)}, { method: "POST" });`;
    it("passes a protected-looking text after an unrelated prefix", () => {
        for (const url of ["/unrelated/api/v1/admin/users", "/unrelated/api/v1/orgs"])
            expect(keysOf("src/probe.ts", post(url))).toEqual([]);
    });
    it("passes a protected-looking text in a query string", () => {
        for (const url of ["/health?next=/api/v1/orgs", "/health?next=/api/v1/admin/users"])
            expect(keysOf("src/probe.ts", post(url))).toEqual([]);
    });
    it("matches after an origin, after a base hole and with a query", () => {
        expect(keysOf("src/probe.ts", post("https://api.example.com/api/v1/orgs?x=1"))).toEqual([
            "POST /orgs",
        ]);
        expect(
            keysOf("src/probe.ts", 'fetch(`${base}/api/v1/admin/users`, { method: "POST" });'),
        ).toEqual(["POST /admin/users"]);
    });
    it("matches whole segments only", () => {
        expect(keysOf("src/probe.ts", post("/api/v1/organisations"))).toEqual([]);
        expect(keysOf("src/probe.ts", post("/api/v1/administrators"))).toEqual([]);
        expect(keysOf("src/probe.ts", post("/api/v1/auth/accept-invite-x"))).toEqual([]);
    });
});

describe("check-org-provisioning-calls: D6690 contract, test-file skip", () => {
    const text = 'fetch("/api/v1/orgs", { method: "POST" });';
    for (const name of [
        "src/probe.test.ts",
        "src/probe.spec.tsx",
        "src/probe.test.fixture.ts",
        "src/probe.spec.helper.ts",
    ])
        it(`skips ${name}`, () => {
            expect(failures({ [name]: text })).toEqual([]);
        });
    it("scans a name that only contains test or spec without the dots", () => {
        expect(failures({ "src/contest.ts": text })).toEqual(["FAIL src/contest.ts:1 POST /orgs"]);
    });
});

describe("check-org-provisioning-calls: D6690 contract, callee unwrap on adminApi.users.create", () => {
    it("refuses the direct, the comma and the parenthesised forms", () => {
        for (const text of [
            "adminApi.users.create(data, token);",
            "(0, adminApi.users.create)(data, token);",
            "(adminApi.users.create)(data, token);",
        ])
            expect(keysOf("src/probe.ts", text)).toEqual(["call adminApi.users.create"]);
    });
});

describe("check-org-provisioning-calls: D6690 contract, stated limits (not detected by contract)", () => {
    it("does not fold a constant inside a template substitution", () => {
        for (const text of [
            'fetch(`/api/v1/${"admin"}/users`, { method: "POST" });',
            'fetch(`/api/v1/${"orgs"}`, { method: "POST" });',
            'fetch(`/api/v1/auth/${"accept-invite"}`, { method: "POST" });',
        ])
            expect(keysOf("src/probe.ts", text)).toEqual([]);
    });
    it("does not fold a constant member segment in a template", () => {
        expect(keysOf("src/probe.ts", 'const p = `/orgs/${"acme"}/${"members"}`;')).toEqual([]);
    });
    it("does not see a path held in a variable", () => {
        const text = 'const p = "/api/v1/orgs"; fetch(p, { method: "POST" });';
        expect(keysOf("src/probe.ts", text)).toEqual([]);
    });
    it("does not read CommonJS object exports of createUser", () => {
        expect(keysOf("src/probe.cjs", "module.exports = { createUser() {} };")).toEqual([]);
        expect(keysOf("src/probe.cjs", "module.exports = { ...{ createUser } };")).toEqual([]);
    });
});
