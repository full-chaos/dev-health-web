import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
    auth: vi.fn(),
}));

vi.mock("@/lib/origin", () => ({
    getBackendUrl: vi.fn(() => "http://localhost:8000"),
}));

vi.mock("@/lib/logger", () => ({
    logger: {
        child: vi.fn(() => ({
            info: vi.fn(),
        })),
    },
}));

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(),
}));

import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function request(): NextRequest {
    return new NextRequest("http://localhost:3000/");
}

beforeEach(() => {
    vi.unstubAllEnvs();
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
