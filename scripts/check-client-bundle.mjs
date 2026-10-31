/**
 * Build check: server-only code and secret values stay out of client bundles.
 *
 * `import "server-only"` makes the build refuse a client import of a marked module. This check is
 * the second line, on the build OUTPUT: it reads every file the browser can get
 * (`<dist>/static`: JavaScript, source maps, CSS, JSON and the rest) and fails when one holds text of a registered server-only module, or the
 * value of a secret environment variable.
 *
 * A check that cannot measure fails; it never passes by default:
 *  - no client JavaScript file in the build output: fail;
 *  - a registered module without the `server-only` import, or without its marker text: fail;
 *  - a marker that is not in the server output: fail (the scan could not see it in a client file
 *    either, so "0 client files" would prove nothing);
 *  - the names of the server environment variables (the keys of the schema in
 *    `src/lib/serverEnv.server.ts`, minus the few the client-graph reader may hold) are looked for
 *    in client files too; a schema with no key, or a name that is not in the server output, fails;
 *  - with `--require-secrets`, a secret variable with no value to look for: fail;
 *  - the pattern rules (`PATTERN_RULES`: key material, refresh and token-exchange endpoints, the
 *    session cookie name, JWT-shaped text, signing code) are looked for in every client file; a rule
 *    that does not match its own seed text, or matches its own benign text, fails (a dead or
 *    over-wide rule is not a pass);
 *  - the value rules (key material, JWT-shaped text) and the secret values are also looked for in
 *    the prerendered output the server sends as is (`.html`, `.rsc`, `.body`).
 *
 * There is no allowlist and no exemption by file. A false positive is fixed by a narrower rule
 * and a benign sample that must not match. Bare `access_token` / `refresh_token` field names and
 * `Authorization: Bearer` are NOT rules: client code that holds them today (CHAOS-3280 wave 7)
 * would fail on a rule that has no way to tell it from key or signing code.
 *
 * Output: file names, marker texts and variable NAMES only. A secret value is never printed.
 *
 * Usage: node scripts/check-client-bundle.mjs [--dist .next] [--root .] [--require-secrets]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Server-only modules and, for each, text that the compiler keeps (string literals). Add a module
 * here when it gets `import "server-only"` and holds logic that must not be public.
 */
export const SERVER_ONLY_MODULES = [
    {
        file: "src/lib/auth.ts",
        markers: ["/api/v1/auth/social-login", "/api/v1/auth/refresh"],
    },
    { file: "src/lib/authValidationMemo.ts", markers: ["authValidationMemo"] },
    { file: "src/lib/authBrowserSession.ts", markers: ["unsupported_session_update"] },
    { file: "src/lib/impersonationStatusMemo.ts", markers: ["impersonationStatusShared"] },
    { file: "src/lib/serverEnv.server.ts", markers: ["TRUSTED_PROXY_HOPS"] },
    { file: "src/lib/acr/assertion.ts", markers: ["EdDSA"] },
    { file: "src/lib/acr/config.ts", markers: ["Agent Context Runtime is not configured."] },
    { file: "src/lib/acr/client.ts", markers: ["/api/v1/agent-context/capabilities"] },
    { file: "src/lib/acr/ops.ts", markers: ["/api/v1/licensing/entitlements/"] },
    { file: "src/lib/acr/service.ts", markers: ["Approval is unavailable while impersonating."] },
    {
        file: "src/lib/ask-dev/investigation.server.ts",
        markers: ["Ask Dev is unavailable while impersonating."],
    },
];

/**
 * Text that must not be in a client file. `seed` must match `pattern`; `benign` (and each of `benigns`) must not. `value`
 * rules also run on prerendered output. A hit prints the rule id, the file and the offset, never the text.
 */
export const PATTERN_RULES = [
    {
        id: "K1",
        what: "private key header",
        pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----(?:\s|\\[nr]){0,8}[A-Za-z0-9+/]{40,}/,
        seed: "-----BEGIN PRIVATE KEY-----\\nZmFrZS1rZXktYm9keS1mb3ItdGVzdHMtb25seS1ub3QtYS1rZXk=",
        benign: 'placeholder:"-----BEGIN PRIVATE KEY-----"',
        benigns: ["-----BEGIN CERTIFICATE-----", "-----BEGIN PRIVATE KEY-----\\n"],
        value: true,
    },
    {
        id: "K2",
        what: "refresh or token-exchange endpoint",
        pattern: /\/api\/v1\/auth\/(?:refresh|social-login)/,
        seed: "/api/v1/auth/refresh",
        benign: "/api/v1/auth/session",
        value: false,
    },
    {
        id: "K3",
        what: "session cookie name",
        pattern: /(?:__Secure-|__Host-)?(?:authjs|next-auth)\.session-token/,
        seed: "__Secure-authjs.session-token",
        benign: "authjs.callback-url",
        value: false,
    },
    {
        id: "K4",
        what: "JWT-shaped text",
        pattern: /eyJ[A-Za-z0-9_-]{10,512}\.eyJ[A-Za-z0-9_-]{10,16384}\.[A-Za-z0-9_-]{10,1024}/,
        seed: "eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ4eHh4eHh4eHgifQ.c2lnbmF0dXJlLWJ5dGVz",
        benign: "eyJhbGciOiJFZERTQSJ9",
        value: true,
    },
    {
        id: "K5",
        what: "signing code",
        pattern: /createPrivateKey|EdDSA/,
        seed: "createPrivateKey",
        benign: "createHash",
        value: false,
    },
    {
        // CHAOS-11930, CHAOS-3440: the Ask Dev test-mode seam (`testModeAnswer.ts`: turns in, the
        // chosen receipts and the narrower re-ask out) is for `next dev` under Playwright only; a
        // production build must have dropped it. The prefix is matched, so a key composed at run
        // time from it is caught too.
        id: "K6",
        what: "Ask Dev test-mode answer seam",
        pattern: /ask-dev:test-mode-/,
        seed: "ask-dev:test-mode-choice",
        benign: "ask-dev-transcript",
        value: false,
    },
];

/** Prerendered files the server sends as is; they reach the browser although they are not in `static`. */
export const PRERENDERED_EXTENSIONS = [".html", ".rsc", ".body"];

/** The schema of the server environment variables, and the reader a client graph gets instead. */
export const SERVER_ENV_FILE = "src/lib/serverEnv.server.ts";
export const CLIENT_ENV_FILE = "src/lib/serverEnv.default.ts";

/**
 * Names that may be in a client file although they are in the server schema: public names, and
 * names that a third-party package in the client bundle holds on its own.
 */
export const CLIENT_ENV_NAME_PREFIXES = ["NEXT_PUBLIC_"];
export const THIRD_PARTY_ENV_NAMES = ["NEXTAUTH_URL"];

const SCHEMA_KEY = /^\s+([A-Z][A-Z0-9_]*):\s*z\./gm;

function schemaKeys(source) {
    return [...source.matchAll(SCHEMA_KEY)].map((match) => match[1]);
}

function wholeWord(name) {
    return new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`);
}

/** Environment variables whose VALUE is a secret. */
export const SECRET_ENV_NAMES = [
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "AUTH_GITHUB_SECRET",
    "AUTH_GOOGLE_SECRET",
    "AUTH_GITLAB_SECRET",
    "LINEAR_API_KEY",
];

/** A shorter value can be in a bundle by chance (`test`, `1`), so it is not a usable needle. */
export const MIN_SECRET_LENGTH = 8;

const SERVER_ONLY_IMPORT = /^\s*import\s+["']server-only["'];?\s*$/m;

function filesWithExtension(directory, extensions) {
    if (!existsSync(directory)) return [];
    const found = [];
    for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) found.push(...filesWithExtension(path, extensions));
        else if (extensions === null || extensions.some((extension) => name.endsWith(extension))) {
            found.push(path);
        }
    }
    return found;
}

const javascriptFiles = (directory) => filesWithExtension(directory, [".js"]);

/**
 * @returns {{ ok: boolean, failures: string[], summary: Record<string, number> }}
 */
export function checkClientBundle({
    root,
    dist,
    env = {},
    requireSecrets = false,
    modules = SERVER_ONLY_MODULES,
    secretNames = SECRET_ENV_NAMES,
    serverEnvFile = SERVER_ENV_FILE,
    clientEnvFile = CLIENT_ENV_FILE,
    thirdPartyEnvNames = THIRD_PARTY_ENV_NAMES,
    rules = PATTERN_RULES,
}) {
    const failures = [];

    for (const rule of rules) {
        if (!rule.pattern.test(rule.seed)) {
            failures.push(`rule ${rule.id}: does not match its own seed text`);
        }
        if ([rule.benign, ...(rule.benigns ?? [])].some((text) => rule.pattern.test(text))) {
            failures.push(`rule ${rule.id}: matches its own benign text`);
        }
    }

    const markers = [];
    for (const entry of modules) {
        const sourcePath = join(root, entry.file);
        if (!existsSync(sourcePath)) {
            failures.push(`${entry.file}: registered server-only module does not exist`);
            continue;
        }
        const source = readFileSync(sourcePath, "utf8");
        if (!SERVER_ONLY_IMPORT.test(source)) {
            failures.push(`${entry.file}: registered module has no \`import "server-only"\``);
        }
        if (entry.markers.length === 0) {
            failures.push(`${entry.file}: registered module has no marker`);
        }
        for (const marker of entry.markers) {
            if (source.includes(marker)) markers.push({ file: entry.file, marker });
            else failures.push(`${entry.file}: marker "${marker}" is not in the source`);
        }
    }

    // Names of server environment variables: the schema keys minus what a client graph may hold.
    const envNames = [];
    const serverEnvPath = join(root, serverEnvFile);
    const clientEnvPath = join(root, clientEnvFile);
    if (!existsSync(serverEnvPath) || !existsSync(clientEnvPath)) {
        failures.push(`${serverEnvFile} / ${clientEnvFile}: env reader file does not exist`);
    } else {
        const serverKeys = schemaKeys(readFileSync(serverEnvPath, "utf8"));
        const clientKeys = new Set(schemaKeys(readFileSync(clientEnvPath, "utf8")));
        for (const key of serverKeys) {
            const allowed =
                clientKeys.has(key) ||
                thirdPartyEnvNames.includes(key) ||
                CLIENT_ENV_NAME_PREFIXES.some((prefix) => key.startsWith(prefix));
            if (!allowed) envNames.push(key);
        }
        if (serverKeys.length === 0 || envNames.length === 0) {
            failures.push(`${serverEnvFile}: no server environment name to look for`);
        }
    }

    // Every file in `static` reaches the browser (source maps, CSS, JSON, text), not only `.js`.
    const clientFiles = filesWithExtension(join(dist, "static"), null);
    const serverFiles = javascriptFiles(join(dist, "server"));
    if (javascriptFiles(join(dist, "static")).length === 0) {
        failures.push(`${join(dist, "static")}: no client JavaScript file (did the build run?)`);
    }
    if (serverFiles.length === 0) {
        failures.push(`${join(dist, "server")}: no server JavaScript file (did the build run?)`);
    }

    const secrets = [];
    for (const name of secretNames) {
        const value = env[name];
        if (typeof value === "string" && value.length >= MIN_SECRET_LENGTH) {
            secrets.push({ name, value });
        } else if (requireSecrets) {
            failures.push(
                `${name}: no value of ${MIN_SECRET_LENGTH}+ characters to look for (--require-secrets)`,
            );
        }
    }

    const serverSeen = new Set();
    for (const path of serverFiles) {
        const text = readFileSync(path, "utf8");
        for (const { marker } of markers) if (text.includes(marker)) serverSeen.add(marker);
    }
    if (serverFiles.length > 0) {
        for (const { file, marker } of markers) {
            if (!serverSeen.has(marker)) {
                failures.push(
                    `${file}: marker "${marker}" is not in the server output, so the scan cannot see it`,
                );
            }
        }
    }

    if (serverFiles.length > 0) {
        const serverText = serverFiles.map((path) => readFileSync(path, "utf8")).join("\n");
        for (const name of envNames) {
            if (!wholeWord(name).test(serverText)) {
                failures.push(
                    `${name}: server environment name is not in the server output, so the scan cannot see it`,
                );
            }
        }
    }

    const prerenderedFiles = filesWithExtension(join(dist, "server"), PRERENDERED_EXTENSIONS);
    let envNameHits = 0;
    let markerHits = 0;
    let secretHits = 0;
    let ruleHits = 0;
    let prerenderedHits = 0;
    for (const path of prerenderedFiles) {
        const text = readFileSync(path, "utf8");
        const name = relative(dist, path);
        for (const rule of rules.filter((candidate) => candidate.value)) {
            const hit = rule.pattern.exec(text);
            if (hit) {
                prerenderedHits += 1;
                failures.push(
                    `${name}: prerendered file matches rule ${rule.id} (${rule.what}) at offset ${hit.index}`,
                );
            }
        }
        for (const secret of secrets) {
            if (text.includes(secret.value)) {
                prerenderedHits += 1;
                failures.push(`${name}: prerendered file holds the value of ${secret.name}`);
            }
        }
    }
    for (const path of clientFiles) {
        const text = readFileSync(path, "utf8");
        const name = relative(dist, path);
        for (const rule of rules) {
            const hit = rule.pattern.exec(text);
            if (hit) {
                ruleHits += 1;
                failures.push(
                    `${name}: client file matches rule ${rule.id} (${rule.what}) at offset ${hit.index}`,
                );
            }
        }
        for (const { file, marker } of markers) {
            if (text.includes(marker)) {
                markerHits += 1;
                failures.push(`${name}: client file holds text of ${file} ("${marker}")`);
            }
        }
        for (const envName of envNames) {
            if (wholeWord(envName).test(text)) {
                envNameHits += 1;
                failures.push(`${name}: client file holds the name of server variable ${envName}`);
            }
        }
        for (const secret of secrets) {
            if (text.includes(secret.value)) {
                secretHits += 1;
                failures.push(`${name}: client file holds the value of ${secret.name}`);
            }
        }
    }

    return {
        ok: failures.length === 0,
        failures,
        summary: {
            clientFiles: clientFiles.length,
            serverFiles: serverFiles.length,
            markers: markers.length,
            markerHits,
            envNames: envNames.length,
            envNameHits,
            secretsChecked: secrets.length,
            secretNames: secretNames.length,
            secretHits,
            rules: rules.length,
            ruleHits,
            prerenderedFiles: prerenderedFiles.length,
            prerenderedHits,
        },
    };
}

/**
 * Modules that must reach the browser only as an async chunk, loaded when code imports them
 * (CHAOS-12104, T14a, the lead's option (c)): never a chunk a page loads up front. Each is found in
 * the client output by marker text the compiler keeps. No page entry list may name a chunk that
 * holds it: not a client-reference manifest, not a build manifest, not a prerendered page.
 *
 * It cannot pass by default: the module and its marker must exist, a client chunk must hold the
 * marker, and there must be entry lists to read.
 */
export const LAZY_CHUNKS = [
    {
        id: "L1",
        what: "the Ask Dev full result validators",
        file: "src/lib/acr/streamValidators.js",
        // An Ajv error path of the result schema. The minifier keeps it; the schema's `$id` and the
        // `schema_version` value are not usable: the first is dropped, and the second is also in
        // the code that reads results.
        marker: "#/$defs/ClaimedFactTable/required",
    },
];

/** Where a page names the chunks it loads up front. */
function entryListFiles(dist) {
    const server = join(dist, "server");
    return [
        ...filesWithExtension(server, ["_client-reference-manifest.js"]),
        ...filesWithExtension(server, PRERENDERED_EXTENSIONS),
        ...filesWithExtension(join(dist, "static"), ["_buildManifest.js", "_ssgManifest.js"]),
        ...["build-manifest.json", "app-build-manifest.json", "fallback-build-manifest.json"]
            .map((name) => join(dist, name))
            .filter((path) => existsSync(path)),
    ];
}

/**
 * @returns {{ ok: boolean, failures: string[], summary: Record<string, number> }}
 */
export function checkLazyChunks({ root, dist, chunks = LAZY_CHUNKS }) {
    const failures = [];
    const clientScripts = javascriptFiles(join(dist, "static"));
    const lists = entryListFiles(dist);
    if (lists.length === 0) {
        failures.push(`${dist}: no page entry list to check (did the build run?)`);
    }
    let lazyFiles = 0;
    let entryHits = 0;
    for (const chunk of chunks) {
        const sourcePath = join(root, chunk.file);
        if (!existsSync(sourcePath)) {
            failures.push(`rule ${chunk.id}: ${chunk.file} does not exist`);
            continue;
        }
        if (!readFileSync(sourcePath, "utf8").includes(chunk.marker)) {
            failures.push(`rule ${chunk.id}: marker "${chunk.marker}" is not in ${chunk.file}`);
            continue;
        }
        const holders = clientScripts
            .filter((path) => readFileSync(path, "utf8").includes(chunk.marker))
            .map((path) => basename(path));
        if (holders.length === 0) {
            failures.push(
                `rule ${chunk.id}: no client chunk holds "${chunk.marker}" (did the build run?)`,
            );
            continue;
        }
        lazyFiles += holders.length;
        for (const list of lists) {
            const text = readFileSync(list, "utf8");
            for (const holder of holders) {
                if (!text.includes(`chunks/${holder}`)) continue;
                entryHits += 1;
                failures.push(
                    `${relative(dist, list)}: names chunks/${holder} up front, which holds ${chunk.what} (rule ${chunk.id}: load it only on demand)`,
                );
            }
        }
    }
    return {
        ok: failures.length === 0,
        failures,
        summary: { lazyChunks: chunks.length, lazyFiles, entryLists: lists.length, entryHits },
    };
}

export function main(argv = process.argv.slice(2), env = process.env, log = console) {
    const repositoryRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
    let root = repositoryRoot;
    let dist;
    let requireSecrets = false;
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === "--dist") dist = argv[(i += 1)];
        else if (argv[i] === "--root") root = argv[(i += 1)];
        else if (argv[i] === "--require-secrets") requireSecrets = true;
        else {
            log.error(`Unknown argument: ${argv[i]}`);
            return 2;
        }
    }
    root = resolve(root);
    dist = resolve(dist ?? join(root, ".next"));

    const bundle = checkClientBundle({ root, dist, env, requireSecrets });
    const lazy = checkLazyChunks({ root, dist });
    const result = { ok: bundle.ok && lazy.ok, failures: [...bundle.failures, ...lazy.failures] };
    const s = bundle.summary;
    const l = lazy.summary;
    log.log(
        `client bundle check: ${s.clientFiles} client files, ${s.serverFiles} server files, ` +
            `${s.markers} markers (${s.markerHits} client hits), ` +
            `${s.envNames} server variable names (${s.envNameHits} client hits), ` +
            `${s.secretsChecked} of ${s.secretNames} secret values looked for (${s.secretHits} client hits), ` +
            `${s.rules} pattern rules (${s.ruleHits} hits), ${s.prerenderedFiles} prerendered files (${s.prerenderedHits} hits), ` +
            `${l.lazyChunks} lazy chunk rules (${l.lazyFiles} chunks, ${l.entryLists} entry lists, ${l.entryHits} hits)`,
    );
    if (!result.ok) {
        for (const failure of result.failures) log.error(`FAIL ${failure}`);
        return 1;
    }
    log.log("client bundle check: pass");
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main();
}
