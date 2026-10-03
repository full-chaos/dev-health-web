import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// CHAOS-8553: the Live Backend E2E router generator reads ops's ingress
// contract (contracts/ingress/v1/planes.json). It read ci/go_served_paths.tsv
// before; ops deletes that ledger (dev-health-ops #3761).
//
// The tests run the real script, as the workflow does, on copies of the two
// real ops files. The fixtures are byte copies from dev-health-ops main at
// a5f74ace51 (git blobs 2f5fc818f1 and 8a4d48c222); the contract is the same
// blob at the head of #3761. `planes.json.txt` has the `.txt` ending only so
// that the formatter does not rewrite the copy.

const WEB_ROOT = resolve(__dirname, "../..");

// The generated file is read back with a real YAML parser, as traefik reads it:
// a file that is not valid YAML fails each test here. `yaml` is not a
// dependency of this repo; `@graphql-codegen/cli` brings it, so it is resolved
// from there. If it is gone, these tests fail; they do not skip.
const localRequire = createRequire(join(WEB_ROOT, "package.json"));
const YAML: { parse: (text: string) => unknown } = localRequire(
    localRequire.resolve("yaml", {
        paths: [localRequire.resolve("@graphql-codegen/cli/package.json")],
    }),
);
const SCRIPT = join(WEB_ROOT, "ci/generate-live-e2e-plane-router.mjs");
const FIXTURES = join(__dirname, "fixtures/live-e2e-plane-router");
const WORKFLOW = join(WEB_ROOT, ".github/workflows/live-e2e.yml");

/** The flags of the workflow step "Generate and start live-e2e plane router (traefik)". */
const WORKFLOW_FLAGS = [
    "--api-port",
    "8001",
    "--go-api-port",
    "8001",
    "--query-api-port",
    "8090",
    "--query-api-only",
    "/api/v1/meta,/api/v1/home",
    "--query-api-extra",
    "/graphql",
];

const trees: string[] = [];

type OpsTree = { root: string; contract: string; ledger: string };

/** A stand-in for an ops checkout that has the contract, the ledger, both or none. */
function opsTree(files: { contract?: boolean | string; ledger?: boolean }): OpsTree {
    const root = mkdtempSync(join(tmpdir(), "live-e2e-plane-router-"));
    trees.push(root);
    const contract = join(root, "contracts/ingress/v1/planes.json");
    const ledger = join(root, "ci/go_served_paths.tsv");
    if (files.contract) {
        mkdirSync(join(root, "contracts/ingress/v1"), { recursive: true });
        if (typeof files.contract === "string") writeFileSync(contract, files.contract);
        else cpSync(join(FIXTURES, "planes.json.txt"), contract);
    }
    if (files.ledger) {
        mkdirSync(join(root, "ci"), { recursive: true });
        cpSync(join(FIXTURES, "go_served_paths.tsv"), ledger);
    }
    return { root, contract, ledger };
}

function generate(inputs: string[], flags: string[] = WORKFLOW_FLAGS) {
    const result = spawnSync(process.execPath, [SCRIPT, ...inputs, ...flags], {
        encoding: "utf8",
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

type RouterFile = {
    http: {
        routers: Record<
            string,
            { rule: string; entryPoints: string[]; priority: number; service: string }
        >;
        services: Record<string, { loadBalancer: { servers: { url: string }[] } }>;
    };
};

/** The generated file as a YAML parser reads it. It throws on a file that is not valid YAML. */
function parseRouterFile(yaml: string): RouterFile {
    return YAML.parse(yaml) as RouterFile;
}

/** The port of the service that a router sends its requests to. */
function servicePort(yaml: string, name: string): string {
    return new URL(parseRouterFile(yaml).http.services[name].loadBalancer.servers[0].url).port;
}

/** The alternatives of the `PathRegexp` rule of one path router, and the port of its service. */
function route(yaml: string, name: string): { paths: string[]; port: string } {
    const rule = parseRouterFile(yaml).http.routers[name].rule;
    const paths = rule.match(/^PathRegexp\(`\^\((.*)\)\$`\)$/);
    if (!paths) throw new Error(`router ${name} has no path list: ${rule}`);
    return { paths: paths[1].split("|"), port: servicePort(yaml, name) };
}

type Contract = {
    rules: Record<string, unknown>[];
    public_host_rules?: Record<string, unknown>[];
};

function contractWith(change: (contract: Contract) => void): string {
    const contract = JSON.parse(readFileSync(join(FIXTURES, "planes.json.txt"), "utf8"));
    change(contract);
    return JSON.stringify(contract);
}

afterEach(() => {
    for (const tree of trees.splice(0)) rmSync(tree, { recursive: true, force: true });
});

describe("generate-live-e2e-plane-router", () => {
    it("makes the router from the ingress contract when the ledger is gone (ops #3761)", () => {
        const ops = opsTree({ contract: true });

        const result = generate([ops.contract, ops.ledger]);

        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        expect(route(result.stdout, "query-api-paths")).toEqual({
            paths: ["/api/v1/meta", "/api/v1/home", "/graphql"],
            port: "8090",
        });
        expect(route(result.stdout, "go-api-paths").port).toBe("8001");
        expect(route(result.stdout, "go-api-paths").paths).toContain("/api/v1/billing/audit/[^/]+");
        expect(parseRouterFile(result.stdout).http.routers["api-catchall"]).toEqual({
            rule: "PathRegexp(`^/.*$`)",
            entryPoints: ["web"],
            priority: 1,
            service: "api-catchall",
        });
        expect(servicePort(result.stdout, "api-catchall")).toBe("8001");
        expect(result.stdout).toContain(`# ${ops.contract} -- do not hand-edit`);
    });

    it("writes a file that a YAML parser accepts, and a regex backslash comes back unchanged", () => {
        const ops = opsTree({ contract: true });

        const yaml = generate([ops.contract]).stdout;

        // traefik refused the file of an earlier commit ("found unknown escape
        // character"): the public host path /openapi.json is the regex
        // /openapi\.json, and the rule was in a YAML double-quoted scalar.
        // Read back through the parser, the rule must be the regex traefik needs.
        const config = parseRouterFile(yaml);
        expect(Object.keys(config.http.routers)).toEqual([
            "go-api-paths",
            "query-api-paths",
            "api-catchall",
        ]);
        const goPaths = route(yaml, "go-api-paths").paths;
        expect(goPaths.filter((path) => path.includes("openapi"))).toEqual(["/openapi\\.json"]);
        const goRegex = new RegExp(`^(${goPaths.join("|")})$`);
        expect(goRegex.test("/openapi.json")).toBe(true);
        expect(goRegex.test("/openapiXjson")).toBe(false);
        expect(goRegex.test("/api/v1/billing/audit/abc")).toBe(true);
    });

    it("keeps a single quote of a path intact in the YAML file", () => {
        const ops = opsTree({ contract: true });

        // A rule is a YAML single-quoted scalar; a quote in it must be doubled.
        const result = generate(
            [ops.contract],
            ["--query-api-only", "/api/v1/meta", "--query-api-extra", "/it's"],
        );

        expect(result.status).toBe(0);
        expect(route(result.stdout, "query-api-paths").paths).toEqual(["/api/v1/meta", "/it's"]);
    });

    it("reads the contract and not the ledger when the ops checkout has both (ops main)", () => {
        const both = opsTree({ contract: true, ledger: true });
        const contractOnly = opsTree({ contract: true });

        const result = generate([both.contract, both.ledger]);

        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        // The same router as for the tree with no ledger: the ledger was not read.
        expect(result.stdout.replaceAll(both.root, "")).toBe(
            generate([contractOnly.contract, contractOnly.ledger]).stdout.replaceAll(
                contractOnly.root,
                "",
            ),
        );
    });

    it("routes the same paths from the contract as from the ledger of the same ops commit", () => {
        const ops = opsTree({ contract: true, ledger: true });

        const fromContract = generate([ops.contract]).stdout;
        const fromLedger = generate([ops.ledger]).stdout;

        // query-api: the same three paths.
        expect(new Set(route(fromContract, "query-api-paths").paths)).toEqual(
            new Set(route(fromLedger, "query-api-paths").paths),
        );
        // go-api: each ledger path is in the contract. The contract has more
        // go-api paths; they went to go-api before too, through the catch-all.
        const contractGoPaths = new Set(route(fromContract, "go-api-paths").paths);
        const ledgerGoPaths = route(fromLedger, "go-api-paths").paths;
        expect(ledgerGoPaths.length).toBeGreaterThan(100);
        expect(ledgerGoPaths.filter((path) => !contractGoPaths.has(path))).toEqual([]);
        for (const name of ["go-api-paths", "query-api-paths", "api-catchall"]) {
            expect(servicePort(fromContract, name)).toBe(servicePort(fromLedger, name));
        }
    });

    it("reads the ledger of an ops ref that has no contract yet, and says so", () => {
        const ops = opsTree({ ledger: true });

        const result = generate([ops.contract, ops.ledger]);

        expect(result.status).toBe(0);
        expect(result.stderr).toBe(
            `generate-live-e2e-plane-router: no file at ${ops.contract}; reading ${ops.ledger} in its place\n`,
        );
        expect(new Set(route(result.stdout, "query-api-paths").paths)).toEqual(
            new Set(["/api/v1/meta", "/api/v1/home", "/graphql"]),
        );
    });

    it("fails and names each path when no input exists", () => {
        const ops = opsTree({});

        const result = generate([ops.contract, ops.ledger]);

        expect(result.status).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toBe(
            `generate-live-e2e-plane-router: none of the inputs exists: ${ops.contract}, ${ops.ledger}\n`,
        );
    });

    it.each([
        ["bad JSON", "{ not json", "is not valid JSON"],
        [
            "another schema version",
            contractWith((contract) => Object.assign(contract, { schema_version: 2 })),
            "is not the ingress contract this generator reads",
        ],
        [
            "a path rule with no end anchor",
            contractWith((contract) => {
                contract.rules[1] = { ...contract.rules[1], path: "/graphql" };
            }),
            'has a path rule that does not end with "$"',
        ],
        [
            "a catch-all that is not go-api",
            contractWith((contract) => {
                contract.rules[0] = { ...contract.rules[0], plane: "query-api" };
            }),
            "live-e2e routes the catch-all to go-api",
        ],
        [
            "no public host list",
            contractWith((contract) => {
                delete contract.public_host_rules;
            }),
            "is not the ingress contract this generator reads",
        ],
        [
            "a public host rule that is not an exact path",
            contractWith((contract) => {
                contract.public_host_rules = [
                    { path: "/metrics$", path_type: "ImplementationSpecific", plane: "go-api" },
                ];
            }),
            "has a public host rule this generator cannot read",
        ],
        [
            "no query-api rule",
            contractWith((contract) => {
                contract.rules = contract.rules.filter((rule) => rule.plane !== "query-api");
            }),
            "found ZERO query-api paths",
        ],
    ])(
        "fails on a contract with %s, and does not go on to the ledger",
        (_name, contract, message) => {
            const ops = opsTree({ contract, ledger: true });

            const result = generate([ops.contract, ops.ledger]);

            expect(result.status).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(message);
            expect(result.stderr).toContain(ops.contract);
            expect(result.stderr).not.toContain("in its place");
        },
    );

    it("fails when --query-api-only names a path the contract does not give to query-api", () => {
        const ops = opsTree({ contract: true });

        const result = generate(
            [ops.contract],
            ["--query-api-only", "/api/v1/meta,/api/v1/billing/audit"],
        );

        expect(result.status).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(
            "--query-api-only names path(s) that " +
                `${ops.contract} does not give to query-api: /api/v1/billing/audit`,
        );
    });

    it("the Live Backend E2E workflow gives the contract first and the ledger second", () => {
        const workflow = readFileSync(WORKFLOW, "utf8");

        expect(workflow).toContain(
            [
                "node ci/generate-live-e2e-plane-router.mjs \\",
                "                    dev-health-ops/contracts/ingress/v1/planes.json \\",
                "                    dev-health-ops/ci/go_served_paths.tsv \\",
                `                    ${WORKFLOW_FLAGS.slice(0, 6).join(" ")} \\`,
                `                    ${WORKFLOW_FLAGS.slice(6).join(" ")} \\`,
            ].join("\n"),
        );
    });
});
