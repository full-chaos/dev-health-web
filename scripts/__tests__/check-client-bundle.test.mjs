import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    MIN_SECRET_LENGTH,
    PATTERN_RULES,
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
    extra = {},
} = {}) {
    const root = mkdtempSync(join(tmpdir(), "client-bundle-check-"));
    write(join(root, "src/lib/secretLogic.ts"), source);
    if (envServer !== null) write(join(root, "src/lib/envServer.ts"), envServer);
    if (envClient !== null) write(join(root, "src/lib/envClient.ts"), envClient);
    if (client !== null) write(join(root, ".next/static/chunks/a.js"), client);
    if (server !== null) write(join(root, ".next/server/chunks/b.js"), server);
    for (const [name, text] of Object.entries(extra)) write(join(root, ".next", name), text);
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

describe("the pattern rules", () => {
    const byId = Object.fromEntries(PATTERN_RULES.map((rule) => [rule.id, rule]));

    it("are these five, and a rule is never added or dropped without this test", () => {
        expect(PATTERN_RULES.map((rule) => rule.id)).toEqual(["K1", "K2", "K3", "K4", "K5"]);
        expect(PATTERN_RULES.filter((rule) => rule.value).map((rule) => rule.id)).toEqual([
            "K1",
            "K4",
        ]);
    });

    it.each(PATTERN_RULES)("$id matches its seed and none of its benign text", (rule) => {
        expect(rule.pattern.test(rule.seed)).toBe(true);
        for (const text of [rule.benign, ...(rule.benigns ?? [])]) {
            expect(rule.pattern.test(text), text).toBe(false);
        }
    });

    it.each(PATTERN_RULES)(
        "$id fails a client file that holds its seed, with the id and an offset, never the text",
        (rule) => {
            const result = check(tree({ client: `x=1;var k="${rule.seed}";` }));

            expect(result.ok).toBe(false);
            expect(result.summary.ruleHits).toBe(1);
            expect(result.failures).toEqual([
                `static/chunks/a.js: client file matches rule ${rule.id} (${rule.what}) at offset 11`,
            ]);
            expect(result.failures.join("\n")).not.toContain(rule.seed);
        },
    );

    it.each(PATTERN_RULES)("$id does not fail a client file that holds its benign text", (rule) => {
        for (const text of [rule.benign, ...(rule.benigns ?? [])]) {
            expect(check(tree({ client: `x=${JSON.stringify(text)}` })).failures, text).toEqual([]);
        }
    });

    it("does not fail a client file with a bare token field name or a bearer header", () => {
        const client =
            "a={access_token:s.access_token,refresh_token:d.refresh_token};h={Authorization:`Bearer ${t}`}";

        expect(check(tree({ client })).failures).toEqual([]);
    });

    it("K1 does not fail the placeholder of the private key field of a form (header only)", () => {
        for (const client of [
            'placeholder:"-----BEGIN PRIVATE KEY-----"})})]}),',
            'rows:6,placeholder:"-----BEGIN RSA PRIVATE KEY-----"',
            'x="-----BEGIN PRIVATE KEY-----\\n-----END PRIVATE KEY-----"',
        ]) {
            expect(check(tree({ client })).failures, client).toEqual([]);
        }
    });

    describe("K1 fails a fake key (random base64 body, never a real key)", () => {
        const BODY = "q83vEjRWeJq3zF0u7H1pN4cYtB2kLmD9aXoS6gUiVbT5nZyW8Rf3Qw8mZp2LxK9d";
        const BODY_LINES = `${BODY}\nT3pQ9zXw1Lk=`;

        it.each([
            [
                "JS-escaped newline",
                `"-----BEGIN PRIVATE KEY-----\\n${BODY}\\n-----END PRIVATE KEY-----"`,
            ],
            ["JS-escaped CRLF", `"-----BEGIN PRIVATE KEY-----\\r\\n${BODY}"`],
            [
                "real newline",
                `\`-----BEGIN PRIVATE KEY-----\n${BODY_LINES}\n-----END PRIVATE KEY-----\``,
            ],
            ["real CRLF", `"-----BEGIN PRIVATE KEY-----\r\n${BODY}"`],
            ["RSA header", `"-----BEGIN RSA PRIVATE KEY-----\\n${BODY}"`],
            ["EC header", `"-----BEGIN EC PRIVATE KEY-----\\n${BODY}"`],
            ["DSA header", `"-----BEGIN DSA PRIVATE KEY-----\\n${BODY}"`],
            ["OPENSSH header", `"-----BEGIN OPENSSH PRIVATE KEY-----\\n${BODY}"`],
            ["ENCRYPTED header", `"-----BEGIN ENCRYPTED PRIVATE KEY-----\\n${BODY}"`],
        ])("%s", (_name, literal) => {
            const result = check(tree({ client: `var k=${literal};` }));

            expect(result.failures).toEqual([
                "static/chunks/a.js: client file matches rule K1 (private key header) at offset 7",
            ]);
            expect(result.failures.join("\n")).not.toContain(BODY);
        });
    });

    it("fails a rule that does not match its own seed, and a rule that matches its benign text", () => {
        const dead = [{ ...byId.K2, pattern: /never-in-any-file/ }];
        const wide = [{ ...byId.K2, pattern: /api/ }];

        expect(check(tree(), { rules: dead }).failures).toEqual([
            "rule K2: does not match its own seed text",
        ]);
        expect(check(tree(), { rules: wide }).failures).toEqual([
            "rule K2: matches its own benign text",
        ]);
    });

    it.each(["app.js.map", "style.css", "data.json", "notes.txt", "page.html"])(
        "run on %s in static, not only on .js files",
        (name) => {
            const paths = tree({ extra: { [`static/chunks/${name}`]: `"${byId.K1.seed}"` } });

            expect(check(paths).failures).toEqual([
                `static/chunks/${name}: client file matches rule K1 (private key header) at offset 1`,
            ]);
        },
    );

    it("also look for markers, server names and secret values in files that are not .js", () => {
        const paths = tree({
            extra: {
                "static/chunks/a.js.map": 'x="/api/private/marker" HIDDEN_NAME',
                "static/media/b.txt": SECRET,
            },
        });

        expect(check(paths, { env: { A_SECRET: SECRET } }).failures).toEqual([
            'static/chunks/a.js.map: client file holds text of src/lib/secretLogic.ts ("/api/private/marker")',
            "static/chunks/a.js.map: client file holds the name of server variable HIDDEN_NAME",
            "static/media/b.txt: client file holds the value of A_SECRET",
        ]);
    });

    it("still fails when static has no .js file, even with other files in it", () => {
        const result = check(tree({ client: null, extra: { "static/chunks/a.js.map": "{}" } }));

        expect(result.failures.join("\n")).toContain("no client JavaScript file");
    });

    it("K4 runs in linear time on long runs of near matches (no backtracking blow-up)", () => {
        const near = "eyJAAAAAAAAAA".repeat(30000);
        const dotted = `${"eyJ" + "A".repeat(500)}.eyJAAAAAAAAAA#`.repeat(500);
        const started = Date.now();
        const result = check(tree({ client: `var a="${near}";var b="${dotted}"` }));

        expect(result.failures).toEqual([]);
        expect(Date.now() - started).toBeLessThan(10000);
    });

    it("K4 still matches a JWT with a long payload and a long signature", () => {
        const jwt = `eyJ${"A".repeat(40)}.eyJ${"B".repeat(8000)}.${"C".repeat(600)}`;

        expect(check(tree({ client: `x="${jwt}"` })).failures).toEqual([
            "static/chunks/a.js: client file matches rule K4 (JWT-shaped text) at offset 3",
        ]);
    });

    it("run on a client file in a nested folder and name the file", () => {
        const paths = tree({
            extra: { "static/chunks/app/deep/b.js": `y="${byId.K3.seed}"` },
        });

        expect(check(paths).failures).toEqual([
            "static/chunks/app/deep/b.js: client file matches rule K3 (session cookie name) at offset 3",
        ]);
    });

    it("main returns 1 and prints the rule id, not the matched text", () => {
        const paths = tree({ client: `var k="${byId.K2.seed}"` });
        const lines = [];
        const log = { log: (line) => lines.push(line), error: (line) => lines.push(line) };

        const code = main(["--root", paths.root, "--dist", paths.dist], {}, log);

        expect(code).toBe(1);
        expect(lines.join("\n")).toContain("client file matches rule K2");
        expect(lines.join("\n")).not.toContain(byId.K2.seed);
    });
});

describe("prerendered output the server sends as is", () => {
    const byId = Object.fromEntries(PATTERN_RULES.map((rule) => [rule.id, rule]));

    it.each([
        ["server/app/page.html", "K1"],
        ["server/app/page.rsc", "K4"],
        ["server/app/x/page.segments/_tree.segment.rsc", "K4"],
        ["server/app/y.body", "K1"],
    ])("fails when %s holds the value rule %s", (name, id) => {
        const result = check(tree({ extra: { [name]: `<p>${byId[id].seed}</p>` } }));

        expect(result.ok).toBe(false);
        expect(result.failures).toEqual([
            `${name}: prerendered file matches rule ${id} (${byId[id].what}) at offset 3`,
        ]);
        expect(result.failures.join("\n")).not.toContain(byId[id].seed);
    });

    it("counts prerendered hits apart from client hits in the summary", () => {
        const result = check(
            tree({
                client: `"${byId.K2.seed}"`,
                extra: { "server/app/page.html": byId.K4.seed },
            }),
        );

        expect(result.summary).toMatchObject({ ruleHits: 1, secretHits: 0, prerenderedHits: 1 });
        const lines = [];
        const log = { log: (line) => lines.push(line), error: () => {} };
        const paths = tree({ extra: { "server/app/page.html": `<p>${SECRET}</p>` } });
        const env = Object.fromEntries(SECRET_ENV_NAMES.map((name) => [name, SECRET]));
        main(["--root", paths.root, "--dist", paths.dist], env, log);
        expect(lines[0]).toContain("(0 client hits)");
        expect(lines[0]).toContain("1 prerendered files (6 hits)");
    });

    it("fails when a prerendered file holds the value of a secret, and does not print it", () => {
        const result = check(tree({ extra: { "server/app/page.html": `<p>${SECRET}</p>` } }), {
            env: { A_SECRET: SECRET },
        });

        expect(result.failures).toEqual([
            "server/app/page.html: prerendered file holds the value of A_SECRET",
        ]);
        expect(result.failures.join("\n")).not.toContain(SECRET);
    });

    it("does not run the endpoint, cookie and signing rules on it", () => {
        const text = ["K2", "K3", "K5"].map((id) => byId[id].seed).join(" ");
        const result = check(tree({ extra: { "server/app/page.html": text } }));

        expect(result.failures).toEqual([]);
        expect(result.summary.prerenderedFiles).toBe(1);
    });

    it("does not read a file of another kind in the server output as served text", () => {
        const result = check(
            tree({
                extra: { "server/app/page.js": byId.K1.seed, "server/app/m.json": byId.K4.seed },
            }),
        );

        expect(result.failures).toEqual([]);
        expect(result.summary.prerenderedFiles).toBe(0);
    });
});

describe("the registry of server-only modules", () => {
    it("names the auth, key, signing and session-memo modules", () => {
        expect(SERVER_ONLY_MODULES.map((entry) => entry.file)).toEqual([
            "src/lib/auth.ts",
            "src/lib/authValidationMemo.ts",
            "src/lib/authBrowserSession.ts",
            "src/lib/impersonationStatusMemo.ts",
            "src/lib/serverEnv.server.ts",
            "src/lib/acr/assertion.ts",
            "src/lib/acr/config.ts",
            "src/lib/acr/client.ts",
            "src/lib/acr/ops.ts",
            "src/lib/acr/service.ts",
            "src/lib/ask-dev/investigation.server.ts",
        ]);
    });

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
