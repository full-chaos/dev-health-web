import { describe, expect, it } from "vitest";

import {
    getClientIp,
    getClientIpFromEnv,
    isTrustProxyEnabled,
    parseIpEntry,
    parseTrustedProxyHops,
} from "@/lib/client-ip";

function requestWithHeaders(headers: Record<string, string>) {
    return { headers: new Headers(headers) };
}

const trusted = { trustProxy: true, trustedProxyHops: 1 };

describe("client-ip", () => {
    describe("trust off", () => {
        it("ignores x-forwarded-for, x-real-ip and the platform headers", () => {
            const request = requestWithHeaders({
                "x-forwarded-for": "198.51.100.10, 10.0.0.1",
                "x-real-ip": "203.0.113.20",
                "x-vercel-forwarded-for": "203.0.113.21",
                "cf-connecting-ip": "203.0.113.22",
                "user-agent": "test-agent",
            });

            expect(getClientIp(request, { trustProxy: false })).toMatch(/^anon:/);
            expect(getClientIp(request)).toMatch(/^anon:/);
        });

        it("a per-request cf-connecting-ip cannot mint a new key", () => {
            const keys = new Set(
                ["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((ip) =>
                    getClientIp(
                        requestWithHeaders({ "cf-connecting-ip": ip, "user-agent": "same" }),
                        { trustProxy: false },
                    ),
                ),
            );
            expect(keys.size).toBe(1);
        });
    });

    describe("trust on, rightmost walk", () => {
        const cases: Array<[string, Record<string, string>, string, number | undefined]> = [
            [
                "single entry (replace mode)",
                { "x-forwarded-for": "198.51.100.7" },
                "198.51.100.7",
                1,
            ],
            [
                "spoofed leftmost entries never win (append mode)",
                { "x-forwarded-for": "6.6.6.6, 7.7.7.7, 198.51.100.7" },
                "198.51.100.7",
                1,
            ],
            [
                "two trusted proxies: skips the inner proxy",
                { "x-forwarded-for": "6.6.6.6, 198.51.100.7, 10.0.0.9" },
                "198.51.100.7",
                2,
            ],
            [
                "malformed entry LEFT of the chosen hop is never read",
                { "x-forwarded-for": "not-an-ip, 198.51.100.7" },
                "198.51.100.7",
                1,
            ],
            [
                "multiple header lines are one chain",
                { "x-forwarded-for": "6.6.6.6, 198.51.100.7" },
                "198.51.100.7",
                1,
            ],
            ["spaces trimmed", { "x-forwarded-for": "  198.51.100.7  " }, "198.51.100.7", 1],
            ["ipv4 with port", { "x-forwarded-for": "198.51.100.7:5555" }, "198.51.100.7", 1],
            ["ipv6", { "x-forwarded-for": "2001:DB8:0:0::1" }, "2001:db8::1", 1],
            ["ipv6 bracket + port", { "x-forwarded-for": "[2001:db8::1]:443" }, "2001:db8::1", 1],
            ["ipv6 zone dropped", { "x-forwarded-for": "fe80::1%eth0" }, "fe80::1", 1],
            [
                "ipv4-mapped ipv6 is unmapped",
                { "x-forwarded-for": "::ffff:198.51.100.7" },
                "198.51.100.7",
                1,
            ],
            [
                "hops default to 1",
                { "x-forwarded-for": "6.6.6.6, 198.51.100.7" },
                "198.51.100.7",
                undefined,
            ],
        ];
        for (const [name, headers, expected, hops] of cases) {
            it(name, () => {
                const request = requestWithHeaders(headers);
                expect(getClientIp(request, { trustProxy: true, trustedProxyHops: hops })).toBe(
                    expected,
                );
            });
        }

        it("hops too high: a short chain never falls back to the leftmost entry", () => {
            const request = requestWithHeaders({
                "x-forwarded-for": "6.6.6.6",
                "user-agent": "ua",
            });
            const result = getClientIp(request, { trustProxy: true, trustedProxyHops: 2 });
            expect(result).not.toBe("6.6.6.6");
            expect(result).toMatch(/^anon:/);
        });

        it("hops too high: a short chain moves on to x-real-ip", () => {
            const request = requestWithHeaders({
                "x-forwarded-for": "6.6.6.6",
                "x-real-ip": "203.0.113.20",
            });
            expect(getClientIp(request, { trustProxy: true, trustedProxyHops: 2 })).toBe(
                "203.0.113.20",
            );
        });

        it("a malformed entry at the chosen position never wins and skips x-real-ip", () => {
            const request = requestWithHeaders({
                "x-forwarded-for": "198.51.100.7, garbage",
                "x-real-ip": "203.0.113.20",
                "user-agent": "ua",
            });
            expect(getClientIp(request, trusted)).toMatch(/^anon:/);
        });

        it("a comma-only chain is malformed: it does not fall through to x-real-ip (r1)", () => {
            const request = requestWithHeaders({
                "x-forwarded-for": ",",
                "x-real-ip": "203.0.113.20",
                "user-agent": "ua",
            });
            expect(getClientIp(request, trusted)).toMatch(/^anon:/);
            const whitespace = requestWithHeaders({
                "x-forwarded-for": "   ",
                "x-real-ip": "203.0.113.20",
            });
            expect(getClientIp(whitespace, trusted)).toBe("203.0.113.20");
        });

        it("the fingerprint ignores x-vercel-id and cf-ray (per-request, client-written) (r1)", () => {
            const base = { "user-agent": "ua" };
            const keys = new Set(
                ["a", "b", "c"].map((id) =>
                    getClientIp(requestWithHeaders({ ...base, "x-vercel-id": id, "cf-ray": id }), {
                        trustProxy: false,
                    }),
                ),
            );
            expect(keys.size).toBe(1);
            expect([...keys][0]).toMatch(/^anon:/);
        });

        it("an empty chosen entry is malformed", () => {
            const request = requestWithHeaders({
                "x-forwarded-for": "198.51.100.7,",
                "user-agent": "ua",
            });
            expect(getClientIp(request, trusted)).toMatch(/^anon:/);
        });
    });

    describe("trust on, fallbacks (chain gave nothing)", () => {
        it("x-real-ip when there is no x-forwarded-for", () => {
            const request = requestWithHeaders({ "x-real-ip": "203.0.113.20" });
            expect(getClientIp(request, trusted)).toBe("203.0.113.20");
        });

        it("a malformed x-real-ip does not win", () => {
            const request = requestWithHeaders({ "x-real-ip": "nope", "user-agent": "ua" });
            expect(getClientIp(request, trusted)).toMatch(/^anon:/);
        });

        it("x-forwarded-for wins over x-real-ip", () => {
            const request = requestWithHeaders({
                "x-forwarded-for": "198.51.100.7",
                "x-real-ip": "203.0.113.20",
            });
            expect(getClientIp(request, trusted)).toBe("198.51.100.7");
        });

        it("platform headers are honoured only with trust on", () => {
            expect(
                getClientIp(
                    requestWithHeaders({ "x-vercel-forwarded-for": "203.0.113.21, 1.1.1.1" }),
                    trusted,
                ),
            ).toBe("203.0.113.21");
            expect(
                getClientIp(requestWithHeaders({ "cf-connecting-ip": "203.0.113.22" }), trusted),
            ).toBe("203.0.113.22");
        });

        it("no header at all gives the anonymous fingerprint, or unknown", () => {
            expect(getClientIp(requestWithHeaders({ "user-agent": "ua" }), trusted)).toMatch(
                /^anon:/,
            );
            expect(getClientIp(requestWithHeaders({}), trusted)).toBe("unknown");
        });
    });

    describe("config parsing", () => {
        it("parses TRUST_PROXY-style booleans", () => {
            expect(isTrustProxyEnabled("true")).toBe(true);
            expect(isTrustProxyEnabled("1")).toBe(true);
            expect(isTrustProxyEnabled("false")).toBe(false);
            expect(isTrustProxyEnabled(undefined)).toBe(false);
        });

        it("TRUSTED_PROXY_HOPS: integers 1..32, everything else is 1 (never 0)", () => {
            expect(parseTrustedProxyHops("1")).toBe(1);
            expect(parseTrustedProxyHops(" 2 ")).toBe(2);
            expect(parseTrustedProxyHops("32")).toBe(32);
            for (const bad of [undefined, "", "0", "-1", "1.5", "abc", "33", "2x", "1e1"]) {
                expect(parseTrustedProxyHops(bad)).toBe(1);
            }
        });

        it("getClientIpFromEnv reads TRUST_PROXY and TRUSTED_PROXY_HOPS", () => {
            const request = requestWithHeaders({
                "x-forwarded-for": "6.6.6.6, 198.51.100.7, 10.0.0.9",
                "user-agent": "ua",
            });
            expect(getClientIpFromEnv(request, {})).toMatch(/^anon:/);
            expect(getClientIpFromEnv(request, { TRUST_PROXY: "true" })).toBe("10.0.0.9");
            expect(
                getClientIpFromEnv(request, { TRUST_PROXY: "true", TRUSTED_PROXY_HOPS: "2" }),
            ).toBe("198.51.100.7");
            expect(
                getClientIpFromEnv(request, { TRUST_PROXY: "true", TRUSTED_PROXY_HOPS: "0" }),
            ).toBe("10.0.0.9");
        });
    });

    describe("parseIpEntry", () => {
        it("rejects hostnames, empties and half-formed forms", () => {
            for (const bad of [
                "",
                "  ",
                "example.com",
                "1.2.3",
                "999.1.1.1",
                "[::1",
                "[::1]x",
                "1.2.3.4:",
                "unknown",
            ]) {
                expect(parseIpEntry(bad)).toBeNull();
            }
            expect(parseIpEntry(null)).toBeNull();
        });
    });
});
