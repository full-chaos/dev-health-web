#!/usr/bin/env node
// CHAOS-7001: derive live-e2e's traefik plane-split router config from
// dev-health-ops's OWN ingress data -- the same data prod's ingress reads,
// never a hand-maintained path list here. live-e2e has no k8s Ingress and no
// bigboy docker network, so unlike bigboy's docker-label/file-provider hybrid
// this emits a plain traefik file-provider dynamic config addressed at
// 127.0.0.1:<port> for three bare processes on the runner (api, go-api,
// query-api), matching the compose stack's SHAPE (traefik file-provider,
// PathRegexp routers, plane-split by path) without needing deploy-repo access
// or a docker network.
//
// CHAOS-8553: the input is ops's ingress contract,
// contracts/ingress/v1/planes.json. It was ci/go_served_paths.tsv; ops deletes
// that ledger with its Python api (dev-health-ops #3761). An ops ref that does
// not have the contract yet is still read through the ledger.
//
// Usage:
//   node ci/generate-live-e2e-plane-router.mjs <input> [<older input> ...] \
//     --api-port 8000 --go-api-port 8001 --query-api-port 8090 \
//     [--query-api-only /api/v1/meta,/api/v1/other] [--query-api-extra /graphql]
//
// Inputs are tried in the order given; the first file that exists is the one
// that is read. A `.json` input is the ingress contract, any other input is the
// tab-separated ledger. When an earlier input does not exist, a line on stderr
// names it and the input that is read in its place. An input that exists but
// cannot be used (bad JSON, another schema) is an error: it is never skipped.
// When no input exists, the error names each path.
//
// CHAOS-7523: live-e2e no longer starts a Python api. The catch-all points at go-api (pass
// --api-port <go-api port>), the way prod's api host does ("/" is the Go api), and the product
// /graphql path goes to query-api through --query-api-extra.
//
// --query-api-only restricts the query-api-owned path set to the given
// intersection with the input, rather than every query-api path in it. Several
// query-api routes (e.g. /api/v1/home) additionally require
// GO_API_ENVELOPE_*/GO_API_REGISTRY_POSTGRES_URI to actually mount -- without
// that provisioning they stay unmounted and 404 even though the input lists
// them. Omit the flag to route every listed query-api path (only correct once
// every route's own activation prerequisites are provisioned too).
//
// Prints the traefik dynamic YAML config to stdout.

import { existsSync, readFileSync } from "node:fs";

const NAME = "generate-live-e2e-plane-router";

function fail(message, code = 1) {
    console.error(`${NAME}: ${message}`);
    process.exit(code);
}

function parseArgs(argv) {
    const args = {
        inputs: [],
        apiPort: "8000",
        goApiPort: "8001",
        queryApiPort: "8090",
        queryApiOnly: null,
        queryApiExtra: [],
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--api-port") args.apiPort = argv[++i];
        else if (a === "--go-api-port") args.goApiPort = argv[++i];
        else if (a === "--query-api-port") args.queryApiPort = argv[++i];
        else if (a === "--query-api-only") args.queryApiOnly = argv[++i].split(",");
        else if (a === "--query-api-extra") args.queryApiExtra = argv[++i].split(",");
        else args.inputs.push(a);
    }
    return args;
}

function escapeRegex(literal) {
    // Mirror ops's ci/bigboy/generate-plane-split-router.py: escape everything,
    // then unescape "-" (no special meaning outside a character class, and an
    // escaped "\-" is a needless YAML double-quoted-scalar escape headache).
    return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\-/g, "-");
}

function pathToRegex(path) {
    // Path params are written "{}" (no name) -- convert each to a
    // whole-segment wildcard, same as the ops generator's {param} handling.
    // The ingress contract writes its paths in this same form.
    const parts = path.split("{}");
    return parts.map(escapeRegex).join("[^/]+");
}

// Both parsers return the paths of each plane as regex fragments with no
// anchors, in input order and without duplicates.

function parseTsv(text) {
    const goPaths = new Set();
    const queryPaths = new Set();
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const cols = trimmed.split("\t");
        if (cols.length < 3) continue;
        const [, plane, path] = cols;
        if (plane === "go-api") goPaths.add(pathToRegex(path));
        else if (plane === "query-api") queryPaths.add(pathToRegex(path));
    }
    return { goPaths: [...goPaths], queryPaths: [...queryPaths] };
}

function parsePlanesContract(text, file) {
    let contract;
    try {
        contract = JSON.parse(text);
    } catch (error) {
        fail(`${file} is not valid JSON: ${error.message}`);
    }
    // The shape is contracts/ingress/v1/planes.schema.json in ops.
    if (
        contract?.schema_version !== 1 ||
        contract.regex_mode !== true ||
        !Array.isArray(contract.rules) ||
        !Array.isArray(contract.public_host_rules)
    ) {
        fail(
            `${file} is not the ingress contract this generator reads (schema_version 1, regex_mode true, a rules list and a public_host_rules list); found schema_version ${JSON.stringify(contract?.schema_version)}, regex_mode ${JSON.stringify(contract?.regex_mode)}`,
        );
    }

    const goPaths = new Set();
    const queryPaths = new Set();
    const otherPlanes = new Map();
    const addToPlane = (plane, fragment) => {
        if (plane === "go-api") goPaths.add(fragment);
        else if (plane === "query-api") queryPaths.add(fragment);
        else otherPlanes.set(plane, (otherPlanes.get(plane) ?? 0) + 1);
    };
    let catchAllPlane = null;
    for (const rule of contract.rules) {
        if (rule.path_type === "Prefix" && rule.path === "/") {
            catchAllPlane = rule.plane;
            continue;
        }
        if (rule.path_type !== "ImplementationSpecific" || typeof rule.path !== "string") {
            fail(`${file} has a rule this generator cannot read: ${JSON.stringify(rule)}`);
        }
        // Each path rule is a regex that ends with "$". The router adds the
        // anchors itself, so the fragment is the rule with the "$" removed.
        if (!rule.path.endsWith("$")) {
            fail(`${file} has a path rule that does not end with "$": ${JSON.stringify(rule)}`);
        }
        addToPlane(rule.plane, rule.path.slice(0, -1));
    }
    // The paths that the public host shows are exact paths, not regexes.
    // live-e2e has one host, so they are routed by plane like the path rules.
    for (const rule of contract.public_host_rules) {
        if (rule.path_type !== "Exact" || typeof rule.path !== "string") {
            fail(
                `${file} has a public host rule this generator cannot read: ${JSON.stringify(rule)}`,
            );
        }
        addToPlane(rule.plane, escapeRegex(rule.path));
    }
    // live-e2e sends the catch-all to --api-port, which the workflow sets to
    // the go-api port. A contract with another catch-all plane needs a change
    // here and in the workflow, not a quiet wrong route.
    if (catchAllPlane !== "go-api") {
        fail(
            `${file}: the catch-all rule ("/", Prefix) is ${JSON.stringify(catchAllPlane)}; live-e2e routes the catch-all to go-api`,
        );
    }
    for (const [plane, count] of otherPlanes) {
        console.error(
            `${NAME}: ${file} has ${count} rule(s) for plane ${JSON.stringify(plane)}; live-e2e starts no such service, so these paths go to the catch-all`,
        );
    }
    return { goPaths: [...goPaths], queryPaths: [...queryPaths] };
}

function readPlanes(inputs) {
    const missing = [];
    for (const file of inputs) {
        if (!existsSync(file)) {
            missing.push(file);
            continue;
        }
        if (missing.length > 0) {
            console.error(
                `${NAME}: no file at ${missing.join(", ")}; reading ${file} in its place`,
            );
        }
        const text = readFileSync(file, "utf8");
        const planes = file.endsWith(".json") ? parsePlanesContract(text, file) : parseTsv(text);
        return { file, ...planes };
    }
    return fail(`none of the inputs exists: ${missing.join(", ")}`);
}

function combinedRegex(fragments) {
    return "^(" + fragments.join("|") + ")$";
}

function emitDynamicConfig({ source, goRegex, queryRegex, apiPort, goApiPort, queryApiPort }) {
    return `# GENERATED by ci/generate-live-e2e-plane-router.mjs from
# ${source} -- do not hand-edit the rule values, regenerate.
# Traefik file-provider dynamic config for live-e2e's bare-process backends.
http:
  routers:
    go-api-paths:
      rule: "PathRegexp(\`${goRegex}\`)"
      entryPoints: [web]
      priority: 1000
      service: go-api-paths
    query-api-paths:
      rule: "PathRegexp(\`${queryRegex}\`)"
      entryPoints: [web]
      priority: 1000
      service: query-api-paths
    api-catchall:
      rule: "PathRegexp(\`^/.*$\`)"
      entryPoints: [web]
      priority: 1
      service: api-catchall
  services:
    go-api-paths:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:${goApiPort}"
    query-api-paths:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:${queryApiPort}"
    api-catchall:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:${apiPort}"
`;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.inputs.length === 0) {
        fail(
            "usage: generate-live-e2e-plane-router.mjs <planes.json> [<go_served_paths.tsv>] [--api-port P] [--go-api-port P] [--query-api-port P]",
            2,
        );
    }
    const { file, goPaths, queryPaths: allQueryPaths } = readPlanes(args.inputs);
    if (goPaths.length === 0) {
        fail(
            `found ZERO go-api paths in ${file} -- refusing to emit an empty router (its shape may have changed)`,
        );
    }
    if (allQueryPaths.length === 0) {
        fail(
            `found ZERO query-api paths in ${file} -- refusing to emit an empty router (its shape may have changed)`,
        );
    }
    let queryPaths = allQueryPaths;
    if (args.queryApiOnly) {
        const allowed = new Set(args.queryApiOnly.map(pathToRegex));
        const unknown = args.queryApiOnly.filter((p) => !allQueryPaths.includes(pathToRegex(p)));
        if (unknown.length > 0) {
            fail(
                `--query-api-only names path(s) that ${file} does not give to query-api: ${unknown.join(", ")}`,
            );
        }
        queryPaths = allQueryPaths.filter((p) => allowed.has(p));
    }
    // --query-api-extra: query-api-owned paths the ledger does not list (the product /graphql path is
    // mounted by query-api on its own, ops internal/queryapi/server/graphql_edge_route.go; the ingress
    // contract lists it, the ledger did not). Each must be an absolute path; they are added verbatim.
    for (const extra of args.queryApiExtra) {
        if (!extra.startsWith("/")) {
            fail(`--query-api-extra path ${extra} is not absolute`);
        }
        const fragment = pathToRegex(extra);
        if (!queryPaths.includes(fragment)) queryPaths = [...queryPaths, fragment];
    }
    process.stdout.write(
        emitDynamicConfig({
            source: file,
            goRegex: combinedRegex(goPaths),
            queryRegex: combinedRegex(queryPaths),
            apiPort: args.apiPort,
            goApiPort: args.goApiPort,
            queryApiPort: args.queryApiPort,
        }),
    );
}

main();
