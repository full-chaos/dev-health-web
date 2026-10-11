import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    MIN_SECRET_LENGTH,
    SECRET_ENV_NAMES,
    SERVER_ONLY_MODULES,
    checkClientBundle,
    main,
} from "../check-client-bundle.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const MODULES = [{ file: "src/lib/secretLogic.ts", markers: ["/api/private/marker"] }];
const SECRET = "value-that-must-stay-on-the-server";

function write(path, text) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
}

/** A small tree: one server-only source file and a build output with one client and one server file. */
const ENV_SERVER = [
    'import "server-only";',
    "const schema = z.object({",
    "    PUBLIC_ISH: z.string().optional(),",
    "    HIDDEN_NAME: z.string().optional(),",
    "    NEXT_PUBLIC_FLAG: z.string().optional(),",
    "    THIRD_PARTY_NAME: z.string().optional(),",
    "});",
    "",
].join("\n");
const ENV_CLIENT = "const schema = z.object({\n    PUBLIC_ISH: z.string().optional(),\n});\n";

function tree({
    envServer = ENV_SERVER,
    envClient = ENV_CLIENT,
    source = 'import "server-only";\nexport const path = "/api/private/marker";\n',
    client = 'console.log("public code")',
    server = 'fetch("/api/private/marker");x={HIDDEN_NAME:1,PUBLIC_ISH:2}',
} = {}) {
    const root = mkdtempSync(join(tmpdir(), "client-bundle-check-"));
    write(join(root, "src/lib/secretLogic.ts"), source);
    if (envServer !== null) write(join(root, "src/lib/envServer.ts"), envServer);
    if (envClient !== null) write(join(root, "src/lib/envClient.ts"), envClient);
    if (client !== null) write(join(root, ".next/static/chunks/a.js"), client);
    if (server !== null) write(join(root, ".next/server/chunks/b.js"), server);
    return { root, dist: join(root, ".next") };
}

const check = (paths, options = {}) =>
    checkClientBundle({
        ...paths,
        modules: MODULES,
        secretNames: ["A_SECRET"],
        serverEnvFile: "src/lib/envServer.ts",
        clientEnvFile: "src/lib/envClient.ts",
        thirdPartyEnvNames: ["THIRD_PARTY_NAME"],
        ...options,
    });

describe("client bundle check", () => {
    it("passes when no client file holds a marker or a secret value", () => {
        const result = check(tree(), { env: { A_SECRET: SECRET }, requireSecrets: true });

        expect(result.failures).toEqual([]);
        expect(result.ok).toBe(true);
        expect(result.summary).toMatchObject({
            clientFiles: 1,
            serverFiles: 1,
            markers: 1,
            markerHits: 0,
            secretsChecked: 1,
            secretHits: 0,
        });
    });

    it("fails when a client file holds text of a server-only module", () => {
        const result = check(tree({ client: 'fetch(base+"/api/private/marker")' }));

        expect(result.ok).toBe(false);
        expect(result.summary.markerHits).toBe(1);
        expect(result.failures).toEqual([
            'static/chunks/a.js: client file holds text of src/lib/secretLogic.ts ("/api/private/marker")',
        ]);
    });

    it("fails when a client file holds a secret value, and does not print the value", () => {
        const result = check(tree({ client: `const s="${SECRET}"` }), {
            env: { A_SECRET: SECRET },
        });

        expect(result.ok).toBe(false);
        expect(result.summary.secretHits).toBe(1);
        expect(result.failures).toEqual([
            "static/chunks/a.js: client file holds the value of A_SECRET",
        ]);
        expect(result.failures.join("\n")).not.toContain(SECRET);
    });

    it("fails when a client file holds the NAME of a server environment variable", () => {
        const result = check(tree({ client: "const k=process.env.HIDDEN_NAME" }));

        expect(result.ok).toBe(false);
        expect(result.summary).toMatchObject({ envNames: 1, envNameHits: 1 });
        expect(result.failures).toEqual([
            "static/chunks/a.js: client file holds the name of server variable HIDDEN_NAME",
        ]);
    });

    it("does not flag a name the client-graph reader holds, a public name or a longer word", () => {
        const result = check(
            tree({
                client: 'x=["PUBLIC_ISH","NEXT_PUBLIC_FLAG","THIRD_PARTY_NAME","HIDDEN_NAME_2"]',
            }),
        );

        expect(result.failures).toEqual([]);
    });

    it("fails when a server environment name is not in the server output", () => {
        const result = check(tree({ server: 'fetch("/api/private/marker")' }));

        expect(result.ok).toBe(false);
        expect(result.failures.join("\n")).toContain(
            "HIDDEN_NAME: server environment name is not in the server output",
        );
    });

    it("fails when the server schema has no name to look for", () => {
        const result = check(tree({ envServer: 'import "server-only";\n' }));

        expect(result.ok).toBe(false);
        expect(result.failures.join("\n")).toContain("no server environment name to look for");
    });

    it("fails when an env reader file does not exist", () => {
        const result = check(tree({ envClient: null }));

        expect(result.ok).toBe(false);
        expect(result.failures.join("\n")).toContain("env reader file does not exist");
    });

    it("fails when the build output has no client file", () => {
        const result = check(tree({ client: null }));

        expect(result.ok).toBe(false);
        expect(result.failures.join("\n")).toContain("no client JavaScript file");
    });

    it("fails when the build output has no server file", () => {
        const result = check(tree({ server: null }));

        expect(result.ok).toBe(false);
        expect(result.failures.join("\n")).toContain("no server JavaScript file");
    });

    it("fails when the marker is not in the server output", () => {
        const result = check(tree({ server: 'console.log("minified away")' }));

        expect(result.ok).toBe(false);
        expect(result.failures.join("\n")).toContain("is not in the server output");
    });

    it("fails when a registered module has no server-only import", () => {
        const result = check(tree({ source: 'export const path = "/api/private/marker";\n' }));

        expect(result.ok).toBe(false);
        expect(result.failures.join("\n")).toContain('has no `import "server-only"`');
    });

    it("does not accept a server-only import that is only in a comment", () => {
        const result = check(
            tree({
                source: '// import "server-only"; later\nexport const p = "/api/private/marker";\n',
            }),
        );

        expect(result.ok).toBe(false);
        expect(result.failures.join("\n")).toContain('has no `import "server-only"`');
    });

    it("fails when a marker is not in the source of its module", () => {
        const result = check(
            tree({ source: 'import "server-only";\nexport const path = "/x";\n' }),
        );

        expect(result.ok).toBe(false);
        expect(result.failures.join("\n")).toContain("is not in the source");
    });

    it("fails when a registered module does not exist", () => {
        const result = check(tree(), {
            modules: [{ file: "src/lib/gone.ts", markers: ["/api/private/marker"] }],
        });

        expect(result.ok).toBe(false);
        expect(result.failures.join("\n")).toContain("does not exist");
    });

    it("with --require-secrets, fails when a secret has no usable value", () => {
        const paths = tree();

        expect(check(paths, { env: {}, requireSecrets: true }).ok).toBe(false);
        expect(
            check(paths, {
                env: { A_SECRET: "x".repeat(MIN_SECRET_LENGTH - 1) },
                requireSecrets: true,
            }).ok,
        ).toBe(false);
        // Without the flag, a missing value is reported in the summary and is not a failure.
        const lenient = check(paths, { env: {} });
        expect(lenient.ok).toBe(true);
        expect(lenient.summary.secretsChecked).toBe(0);
    });

    it("main returns 1 on a failure and prints no secret value", () => {
        const paths = tree({ client: `const s="${SECRET}"` });
        const lines = [];
        const log = { log: (line) => lines.push(line), error: (line) => lines.push(line) };
        const env = Object.fromEntries(SECRET_ENV_NAMES.map((name) => [name, SECRET]));

        // The real registry against a tree that has none of the registered modules.
        const code = main(["--root", paths.root, "--dist", paths.dist], env, log);

        expect(code).toBe(1);
        expect(lines.join("\n")).toContain("client file holds the value of AUTH_SECRET");
        expect(lines.join("\n")).not.toContain(SECRET);
    });

    it("main rejects an unknown argument", () => {
        const lines = [];
        const log = { log: () => {}, error: (line) => lines.push(line) };

        expect(main(["--skip"], {}, log)).toBe(2);
    });
});

describe("the registry of server-only modules", () => {
    it.each(SERVER_ONLY_MODULES)("$file has the server-only import and its markers", (entry) => {
        const source = readFileSync(join(repositoryRoot, entry.file), "utf8");

        expect(source).toMatch(/^import "server-only";$/m);
        expect(entry.markers.length).toBeGreaterThan(0);
        for (const marker of entry.markers) expect(source).toContain(marker);
    });
});

describe("the server environment reader", () => {
    const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
    const mapping = packageJson.imports?.["#server-env"];

    it("maps to the full reader only under the react-server condition", () => {
        expect(mapping).toEqual({
            "react-server": "./src/lib/serverEnv.server.ts",
            default: "./src/lib/serverEnv.default.ts",
        });
    });

    it("the server variant is marked server-only and the config module does not import it directly", () => {
        const server = readFileSync(join(repositoryRoot, mapping["react-server"]), "utf8");
        const config = readFileSync(join(repositoryRoot, "src/lib/config.ts"), "utf8");

        expect(server).toMatch(/^import "server-only";$/m);
        expect(config).not.toMatch(/from\s+["'][^"']*serverEnv\.server/);
        expect(config).toContain('"#server-env"');
    });

    it("the default variant holds no secret variable name", () => {
        const source = readFileSync(join(repositoryRoot, mapping.default), "utf8");

        for (const name of SECRET_ENV_NAMES) expect(source).not.toContain(name);
        expect(source).not.toMatch(/^\s*import\s+["']server-only["']/m);
    });
});

describe("the session read of modules that run on the server and in a browser", () => {
    const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
    const mapping = packageJson.imports?.["#server-session"];

    it("maps to the server variant only under the react-server condition", () => {
        expect(mapping).toEqual({
            "react-server": "./src/lib/serverSession.server.ts",
            default: "./src/lib/serverSession.default.ts",
        });
    });

    it("the default variant has no import of the auth module", () => {
        const source = readFileSync(join(repositoryRoot, mapping.default), "utf8");

        expect(source).not.toMatch(/["']@\/lib\/auth["']/);
        expect(source).not.toMatch(/^\s*import\s+["']server-only["']/m);
    });

    it("the server variant is marked server-only", () => {
        const source = readFileSync(join(repositoryRoot, mapping["react-server"]), "utf8");

        expect(source).toMatch(/^import "server-only";$/m);
    });

    it("no source module loads the auth module with a dynamic import outside the server variant", () => {
        // A dynamic import in a module that a client component can reach puts the auth module in
        // a client bundle; the build then fails, and this test names the cause first.
        const offenders = [];
        const walk = (directory) => {
            for (const entry of readdirSyncSorted(directory)) {
                const path = join(directory, entry.name);
                if (entry.isDirectory()) walk(path);
                else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
                    const text = readFileSync(path, "utf8");
                    if (/import\(\s*["']@\/lib\/auth["']\s*\)/.test(text)) {
                        offenders.push(path.slice(repositoryRoot.length + 1));
                    }
                }
            }
        };
        walk(join(repositoryRoot, "src"));

        expect(offenders).toEqual(["src/lib/serverSession.server.ts"]);
    });
});

function readdirSyncSorted(directory) {
    return readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.name !== "__tests__" && entry.name !== "node_modules")
        .sort((a, b) => a.name.localeCompare(b.name));
}
