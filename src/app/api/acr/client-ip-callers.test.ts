import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-7205: the acr routes derive the limiter key through the REAL client-ip
// helper (not mocked here), so a client-written leftmost X-Forwarded-For entry
// must not change the key.
const { checkRateLimitMock } = vi.hoisted(() => ({ checkRateLimitMock: vi.fn() }));

vi.mock("@/lib/acr/service", () => ({
    approveDeviceAuthorization: vi.fn().mockResolvedValue({ status: "approved" }),
    previewDeviceAuthorization: vi.fn().mockResolvedValue({}),
    decideOAuthConsent: vi.fn().mockResolvedValue({}),
    previewOAuthConsent: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ access_token: "t", user: { id: "u", org_id: "o" } }),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));

import { POST as authorizePost } from "./authorize/route";
import { POST as devicePost } from "./device/route";

const routes = [
    {
        name: "device",
        post: devicePost,
        path: "/api/acr/device",
        body: { action: "preview", user_code: "ABCD2345" },
    },
    {
        name: "authorize",
        post: authorizePost,
        path: "/api/acr/authorize",
        body: { action: "preview", handle: "A".repeat(43) },
    },
];

function request(
    path: string,
    body: unknown,
    forwardedFor: string,
    extra: Record<string, string> = {},
) {
    return new Request(`https://app.example.test${path}`, {
        body: JSON.stringify(body),
        headers: {
            "content-type": "application/json",
            origin: "https://app.example.test",
            "x-forwarded-for": forwardedFor,
            "user-agent": "same-agent",
            ...extra,
        },
        method: "POST",
    });
}

describe.each(routes)("acr $name limiter key", ({ post, path, body }) => {
    beforeEach(() => {
        vi.stubEnv("AUTH_URL", "https://app.example.test");
        checkRateLimitMock.mockResolvedValue({ limited: false, retryAfter: 0 });
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    // The general (per-IP) limiter call is the first checkRateLimit call of a request.
    const firstKeys = async (forwarded: string[], extra: Record<string, string> = {}) => {
        const keys = new Set<string>();
        for (const value of forwarded) {
            const before = checkRateLimitMock.mock.calls.length;
            await post(request(path, body, value, extra));
            keys.add(checkRateLimitMock.mock.calls[before][0] as string);
        }
        return keys;
    };

    it("TRUST_PROXY on: a spoofed leftmost entry does not change the key", async () => {
        vi.stubEnv("TRUST_PROXY", "true");
        const keys = await firstKeys([
            "1.1.1.1, 198.51.100.7",
            "2.2.2.2, 198.51.100.7",
            "junk, 198.51.100.7",
        ]);
        expect([...keys]).toEqual(["198.51.100.7"]);
    });

    it("TRUST_PROXY off: neither x-forwarded-for nor cf-connecting-ip picks the key", async () => {
        const keys = await firstKeys(["1.1.1.1", "2.2.2.2"], { "cf-connecting-ip": "3.3.3.3" });
        expect(keys.size).toBe(1);
        expect([...keys][0]).toMatch(/^anon:/);
    });
});
