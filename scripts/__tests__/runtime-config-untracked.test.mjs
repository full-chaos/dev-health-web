import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GENERATOR = path.join(ROOT, "scripts/write-runtime-config.mjs");
const GENERATED = "public/runtime-config.js";
const TEMPORARY_DIRECTORIES = [];

const PRODUCTION_KEYS = {
    NEXT_PUBLIC_SENTRY_DSN: "https://public@example.invalid/1",
    NEXT_PUBLIC_TELEMETRY_ENABLED: "true",
    NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS: "true",
    NEXT_PUBLIC_GUIDED_ONBOARDING: "true",
    NEXT_PUBLIC_DEV_HEALTH_TEST_MODE: "false",
    NEXT_PUBLIC_DOCS_URL: "https://docs.example.invalid",
};

function git(args) {
    return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

const insideGitCheckout = git(["rev-parse", "--is-inside-work-tree"]).status === 0;

function runGenerator(env) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-config-"));
    TEMPORARY_DIRECTORIES.push(cwd);
    fs.mkdirSync(path.join(cwd, "public"));
    const result = spawnSync(process.execPath, [GENERATOR], {
        cwd,
        env: { PATH: process.env.PATH, ...env },
        encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    const contents = fs.readFileSync(path.join(cwd, GENERATED), "utf8");
    const match = contents.match(/^window\.__DEV_HEALTH_RUNTIME__ = (.*);\n$/m);
    expect(match, contents).not.toBeNull();
    return { contents, publicEnv: JSON.parse(match[1]).publicEnv };
}

afterEach(() => {
    for (const directory of TEMPORARY_DIRECTORIES.splice(0)) {
        fs.rmSync(directory, { force: true, recursive: true });
    }
});

describe("public/runtime-config.js is generated, not tracked", () => {
    it.skipIf(!insideGitCheckout)("is not tracked by git", () => {
        const result = git(["ls-files", "--error-unmatch", GENERATED]);

        expect(
            result.status,
            "public/runtime-config.js is tracked: run `git rm --cached public/runtime-config.js`. " +
                "It is written at start-up; a tracked copy ships test-mode values.",
        ).not.toBe(0);
    });

    it.skipIf(!insideGitCheckout)("stays git-ignored", () => {
        expect(git(["check-ignore", "--no-index", "-q", GENERATED]).status).toBe(0);
    });

    it("writes the production-shaped keys from the environment", () => {
        const { contents, publicEnv } = runGenerator({
            ...PRODUCTION_KEYS,
            SERVER_ONLY_SECRET: "must-not-leak",
        });

        expect(publicEnv).toEqual(PRODUCTION_KEYS);
        expect(contents).not.toContain("must-not-leak");
    });

    it("maps USE_GRAPHQL_ANALYTICS and defaults the docs URL", () => {
        const { publicEnv } = runGenerator({ USE_GRAPHQL_ANALYTICS: "true" });

        expect(publicEnv).toEqual({
            NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS: "true",
            NEXT_PUBLIC_DOCS_URL: "/docs",
        });
    });

    it("keeps every serving path on the generator", () => {
        const dockerfile = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
        const scripts = JSON.parse(
            fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
        ).scripts;

        expect(dockerfile).toMatch(/^CMD .*write-runtime-config\.mjs.*server\.js/m);
        expect(scripts.predev).toContain("scripts/write-runtime-config.mjs");
        expect(scripts.prestart).toContain("scripts/write-runtime-config.mjs");
    });
});

describe("the browser ACR config in runtime-config.js (CHAOS-12302)", () => {
    it("carries the issuer and the web origin when ACR_OAUTH_ISSUER is set", () => {
        const { publicEnv } = runGenerator({
            ACR_OAUTH_ISSUER: "https://acr.fullchaos.dev",
            AUTH_URL: "https://www.fullchaos.dev/api/auth",
        });
        expect(publicEnv.NEXT_PUBLIC_ACR_OAUTH_ISSUER).toBe("https://acr.fullchaos.dev");
        expect(publicEnv.NEXT_PUBLIC_ACR_WEB_ORIGIN).toBe("https://www.fullchaos.dev");
    });

    it("falls back to NEXTAUTH_URL for the web origin", () => {
        const { publicEnv } = runGenerator({
            ACR_OAUTH_ISSUER: "https://acr.fullchaos.dev",
            NEXTAUTH_URL: "https://www.fullchaos.dev",
        });
        expect(publicEnv.NEXT_PUBLIC_ACR_WEB_ORIGIN).toBe("https://www.fullchaos.dev");
    });

    it("carries neither when ACR_OAUTH_ISSUER is unset", () => {
        const { publicEnv } = runGenerator({ AUTH_URL: "https://www.fullchaos.dev" });
        expect(publicEnv).not.toHaveProperty("NEXT_PUBLIC_ACR_OAUTH_ISSUER");
        expect(publicEnv).not.toHaveProperty("NEXT_PUBLIC_ACR_WEB_ORIGIN");
    });

    it("ignores the public keys set directly: only ACR_OAUTH_ISSUER turns the client on (r1)", () => {
        const { publicEnv } = runGenerator({
            NEXT_PUBLIC_ACR_OAUTH_ISSUER: "https://acr.fullchaos.dev",
            NEXT_PUBLIC_ACR_WEB_ORIGIN: "https://www.fullchaos.dev",
            AUTH_URL: "https://www.fullchaos.dev",
        });
        expect(publicEnv).not.toHaveProperty("NEXT_PUBLIC_ACR_OAUTH_ISSUER");
        expect(publicEnv).not.toHaveProperty("NEXT_PUBLIC_ACR_WEB_ORIGIN");
    });

    it("takes both values from the server settings, never from a directly set public key", () => {
        const { publicEnv } = runGenerator({
            ACR_OAUTH_ISSUER: "https://acr.fullchaos.dev",
            AUTH_URL: "https://www.fullchaos.dev",
            NEXT_PUBLIC_ACR_OAUTH_ISSUER: "https://evil.example",
            NEXT_PUBLIC_ACR_WEB_ORIGIN: "https://evil.example",
        });
        expect(publicEnv.NEXT_PUBLIC_ACR_OAUTH_ISSUER).toBe("https://acr.fullchaos.dev");
        expect(publicEnv.NEXT_PUBLIC_ACR_WEB_ORIGIN).toBe("https://www.fullchaos.dev");
    });

    it("drops a directly set web origin when AUTH_URL gives none", () => {
        const { publicEnv } = runGenerator({
            ACR_OAUTH_ISSUER: "https://acr.fullchaos.dev",
            AUTH_URL: "not a url",
            NEXT_PUBLIC_ACR_WEB_ORIGIN: "https://evil.example",
        });
        expect(publicEnv).not.toHaveProperty("NEXT_PUBLIC_ACR_WEB_ORIGIN");
    });

    it("never carries a server secret alongside", () => {
        const { contents } = runGenerator({
            ACR_OAUTH_ISSUER: "https://acr.fullchaos.dev",
            AUTH_URL: "https://www.fullchaos.dev",
            AUTH_SECRET: "server-secret-value",
            ACR_WEB_ASSERTION_KEY_FILE: "/run/secrets/acr-key",
        });
        expect(contents).not.toContain("server-secret-value");
        expect(contents).not.toContain("ACR_WEB_ASSERTION");
    });
});
