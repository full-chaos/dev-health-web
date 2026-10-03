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
