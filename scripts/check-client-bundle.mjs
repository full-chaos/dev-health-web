/**
 * Build check: server-only code and secret values stay out of client bundles.
 *
 * `import "server-only"` makes the build refuse a client import of a marked module. This check is
 * the second line, on the build OUTPUT: it reads every JavaScript file the browser can get
 * (`<dist>/static`) and fails when one holds text of a registered server-only module, or the
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
 *  - with `--require-secrets`, a secret variable with no value to look for: fail.
 *
 * Output: file names, marker texts and variable NAMES only. A secret value is never printed.
 *
 * Usage: node scripts/check-client-bundle.mjs [--dist .next] [--root .] [--require-secrets]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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
    { file: "src/lib/impersonationStatusMemo.ts", markers: ["impersonationStatusShared"] },
    { file: "src/lib/serverEnv.server.ts", markers: ["TRUSTED_PROXY_HOPS"] },
];

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

function javascriptFiles(directory) {
    if (!existsSync(directory)) return [];
    const found = [];
    for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) found.push(...javascriptFiles(path));
        else if (name.endsWith(".js")) found.push(path);
    }
    return found;
}

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
}) {
    const failures = [];

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

    const clientFiles = javascriptFiles(join(dist, "static"));
    const serverFiles = javascriptFiles(join(dist, "server"));
    if (clientFiles.length === 0) {
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

    let envNameHits = 0;
    let markerHits = 0;
    let secretHits = 0;
    for (const path of clientFiles) {
        const text = readFileSync(path, "utf8");
        const name = relative(dist, path);
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
        },
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

    const result = checkClientBundle({ root, dist, env, requireSecrets });
    const s = result.summary;
    log.log(
        `client bundle check: ${s.clientFiles} client files, ${s.serverFiles} server files, ` +
            `${s.markers} markers (${s.markerHits} client hits), ` +
            `${s.envNames} server variable names (${s.envNameHits} client hits), ` +
            `${s.secretsChecked} of ${s.secretNames} secret values looked for (${s.secretHits} client hits)`,
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
