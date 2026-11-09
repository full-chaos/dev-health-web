import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
    auth: vi.fn(),
}));

vi.mock("@/lib/origin", () => ({
    getBackendUrl: vi.fn(() => "http://localhost:8000"),
}));

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => ({
    logger: {
        child: vi.fn(() => ({
            info: vi.fn(),
            warn,
        })),
    },
}));

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(),
}));

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { scriptHash } from "@/lib/csp/prerenderedCsp.mjs";

function request(pathname = "/"): NextRequest {
    return new NextRequest(`http://localhost:3000${pathname}`);
}

const DIRS: string[] = [];

/** A build output: the prerender manifest plus each prerendered route's HTML. */
function buildOutput(routes: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proxy-csp-dist-"));
    DIRS.push(dir);
    const entries: Record<string, object> = {};
    for (const [route, html] of Object.entries(routes)) {
        entries[route] = { initialRevalidateSeconds: false, srcRoute: route, dataRoute: null };
        const file = path.join(dir, "server/app", route === "/" ? "index.html" : `${route}.html`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, html);
    }
    fs.writeFileSync(
        path.join(dir, "prerender-manifest.json"),
        JSON.stringify({ version: 4, routes: entries, dynamicRoutes: {} }),
    );
    return dir;
}

// The policies below are read with no prerendered page, whatever a local `next build` left in .next.
const NO_PAGES = buildOutput({});

afterAll(() => {
    for (const dir of DIRS.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_DIST_DIR", NO_PAGES);
    warn.mockClear();
});

const WITH_EVAL = /script-src 'self' 'nonce-[A-Za-z0-9_-]+' 'unsafe-eval';/;
const WITHOUT_EVAL = /script-src 'self' 'nonce-[A-Za-z0-9_-]+';/;

/** The policy the proxy sends for one NODE_ENV and one test-mode value (undefined = unset). */
async function policyFor(nodeEnv: string | undefined, testMode: string | undefined) {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("DEV_HEALTH_TEST_MODE", testMode);

    const response = await proxy(request());

    return response.headers.get("Content-Security-Policy") ?? "";
}

describe("proxy Content-Security-Policy", () => {
    it("allows React development eval when browser test mode is enabled", async () => {
        const csp = await policyFor("test", "true");

        expect(csp).toMatch(WITH_EVAL);
    });

    it("does not allow eval when browser test mode is disabled", async () => {
        const csp = await policyFor("test", "false");

        expect(csp).toMatch(WITHOUT_EVAL);
        expect(csp).not.toContain("'unsafe-eval'");
    });

    it("does not allow eval in the test runner when browser test mode is unset", async () => {
        const csp = await policyFor("test", undefined);

        expect(csp).toMatch(WITHOUT_EVAL);
        expect(csp).not.toContain("'unsafe-eval'");
    });

    it.each([["false"], [undefined]])(
        "allows React development eval on the development server (test mode %s)",
        async (testMode) => {
            const csp = await policyFor("development", testMode);

            expect(csp).toMatch(WITH_EVAL);
        },
    );

    it.each([
        ["production", "false"],
        ["production", "true"],
        ["staging", "true"],
        ["", "true"],
        [undefined, "true"],
        [undefined, undefined],
    ])("never allows eval when NODE_ENV is %s and test mode is %s", async (nodeEnv, testMode) => {
        const csp = await policyFor(nodeEnv, testMode);

        expect(csp).toMatch(WITHOUT_EVAL);
        expect(csp).not.toContain("'unsafe-eval'");
    });
});

describe("proxy Content-Security-Policy: the ACR origin (CHAOS-12302)", () => {
    async function policyWithIssuer(issuer: string | undefined) {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("DEV_HEALTH_TEST_MODE", "false");
        vi.stubEnv("ACR_OAUTH_ISSUER", issuer);
        const response = await proxy(request());
        // The nonce differs per request: compare the policies without it.
        return (response.headers.get("Content-Security-Policy") ?? "").replace(
            /'nonce-[A-Za-z0-9_-]+'/u,
            "'nonce-N'",
        );
    }

    it("adds exactly the issuer origin to connect-src, and changes nothing else", async () => {
        const without = await policyWithIssuer(undefined);
        const withIssuer = await policyWithIssuer("https://acr.fullchaos.dev");
        expect(withIssuer).not.toBe(without);
        expect(withIssuer.replace(" https://acr.fullchaos.dev", "")).toBe(without);
        const connect = withIssuer
            .split("; ")
            .find((directive) => directive.startsWith("connect-src "));
        expect(connect?.split(" ")).toContain("https://acr.fullchaos.dev");
    });

    it("is unchanged when ACR_OAUTH_ISSUER is unset or empty", async () => {
        const unset = await policyWithIssuer(undefined);
        expect(await policyWithIssuer("")).toBe(unset);
        expect(unset).not.toContain("acr.");
    });

    it.each([
        ["a path", "https://acr.fullchaos.dev/oauth"],
        ["http on a public host", "http://acr.fullchaos.dev"],
        ["a wildcard", "https://*.fullchaos.dev"],
        ["a second source", "https://acr.fullchaos.dev https://evil.example"],
    ])("adds nothing for an issuer with %s", async (_, issuer) => {
        expect(await policyWithIssuer(issuer)).toBe(await policyWithIssuer(undefined));
    });
});

describe("proxy Content-Security-Policy: prerendered pages by build hash (CHAOS-12365)", () => {
    const html = (script: string) => `<html><body><script>${script}</script></body></html>`;
    const pages = () =>
        buildOutput({
            "/marketing/about": html("about()"),
            "/_not-found": html("notFound()"),
            "/_global-error": html("globalError()"),
        });

    async function scriptSrc(pathname: string, nodeEnv = "production") {
        vi.stubEnv("NODE_ENV", nodeEnv);
        vi.stubEnv("DEV_HEALTH_TEST_MODE", "false");
        const response = await proxy(request(pathname));
        const policy = response.headers.get("Content-Security-Policy") ?? "";
        return policy.split("; ").find((part) => part.startsWith("script-src ")) ?? "";
    }

    const NONCE_PART = /^script-src 'self' 'nonce-[A-Za-z0-9_-]+'/u;

    it("allows a prerendered page's own scripts plus the not-found and global-error ones, and keeps the nonce", async () => {
        vi.stubEnv("NEXT_DIST_DIR", pages());
        const script = await scriptSrc("/marketing/about");
        expect(script).toMatch(NONCE_PART);
        expect(script.replace(NONCE_PART, "")).toBe(
            ` ${scriptHash("about()")} ${scriptHash("notFound()")} ${scriptHash("globalError()")}`,
        );
        expect(script).not.toContain("'unsafe-inline'");
    });

    it("gives a dynamic page the nonce plus only the not-found and global-error hashes", async () => {
        vi.stubEnv("NEXT_DIST_DIR", pages());
        const script = await scriptSrc("/auth/signin");
        expect(script.replace(NONCE_PART, "")).toBe(
            ` ${scriptHash("notFound()")} ${scriptHash("globalError()")}`,
        );
        expect(script).not.toContain(scriptHash("about()"));
    });

    it("adds no hash outside production: a development server prerenders nothing", async () => {
        vi.stubEnv("NEXT_DIST_DIR", pages());
        expect(await scriptSrc("/marketing/about", "development")).toMatch(
            /^script-src 'self' 'nonce-[A-Za-z0-9_-]+' 'unsafe-eval'$/u,
        );
    });

    it("serves no hash, never 'unsafe-inline', and warns once naming the path, when the build output is unreadable", async () => {
        const missing = path.join(os.tmpdir(), `proxy-csp-no-dist-${process.pid}`);
        vi.stubEnv("NEXT_DIST_DIR", missing);
        const first = await scriptSrc("/marketing/about");
        const second = await scriptSrc("/marketing/about");
        expect(first).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9_-]+'$/u);
        expect(second).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9_-]+'$/u);
        expect(first).not.toContain("'unsafe-inline'");
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toEqual({
            path: path.join(missing, "prerender-manifest.json"),
        });
    });
});
