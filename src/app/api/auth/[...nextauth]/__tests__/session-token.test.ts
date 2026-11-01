/**
 * CHAOS-10876 C1: the service session token lives in the sealed session cookie and nowhere else.
 * These tests run the REAL next-auth handlers (no next-auth mock): the session endpoint that
 * useSession reads, and a credentials sign-in under class eddsa. No served body, URL, redirect or
 * cookie other than the sealed session cookie may hold the token or the actor id.
 */
import { generateKeyPairSync, sign } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decode, encode } from "next-auth/jwt";
import { NextRequest } from "next/server";

const SECRET = "chaos-10876-c1-route-test-secret";
const COOKIE = "authjs.session-token";
const ORIGIN = "http://localhost:3000";
const ISSUER = "https://auth.example.test";
const BACKEND = "http://auth.backend.test";
const SERVICE = "svc-token-value-chaos-10876";
const ACTOR = "prn_BBBBBBBBBBBBBBBBBBBBBB";

vi.stubEnv("AUTH_SECRET", SECRET);
vi.stubEnv("AUTH_URL", `${ORIGIN}/api/auth`);
vi.stubEnv("BACKEND_URL", BACKEND);

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const b64 = (s: string) => Buffer.from(s).toString("base64url");
function mint(aud: string, exp: number, extra: Record<string, unknown> = {}): string {
    const nowS = Math.floor(Date.now() / 1000);
    const h = b64(JSON.stringify({ alg: "EdDSA", typ: "at+jwt", kid: "kid-1" }));
    const p = b64(
        JSON.stringify({
            iss: ISSUER,
            aud,
            sub: "prn_AAAAAAAAAAAAAAAAAAAAAA",
            principal_type: "human",
            sid: "ses_AAAAAAAAAAAAAAAAAAAAAQ",
            jti: "000000000000000000000001",
            iat: nowS - 10,
            nbf: nowS - 10,
            exp,
            scope: aud === "auth-service" ? "auth:session" : "api:access",
            ...extra,
        }),
    );
    return `${h}.${p}.${Buffer.from(sign(null, Buffer.from(`${h}.${p}`), privateKey)).toString("base64url")}`;
}

type Route = (req: NextRequest) => Promise<Response>;
let GET: Route;
let POST: Route;
const fetchMock = vi.fn();

beforeAll(async () => {
    vi.stubGlobal("fetch", fetchMock);
    ({ GET, POST } = (await import("../route")) as unknown as { GET: Route; POST: Route });
});
afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

function headersText(res: Response): string {
    return [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
}

describe("the session endpoint with a service session token in the sealed cookie", () => {
    it("serves neither the token nor the actor, in the body or in any header", async () => {
        const now = Date.now();
        const value = await encode({
            secret: SECRET,
            salt: COOKIE,
            token: {
                sub: "user-1",
                id: "user-1",
                access_token: "ops-access",
                refresh_token: "ops-refresh",
                session_access_token: SERVICE,
                session_expires_at: now + 3600_000,
                act_sub: ACTOR,
                expires_at: now + 3600_000,
                last_validated: now,
            },
        });
        const res = await GET(
            new NextRequest(`${ORIGIN}/api/auth/session`, {
                headers: { cookie: `${COOKIE}=${value}` },
            }),
        );
        expect(res.status).toBe(200);
        const text = await res.text();
        for (const secret of [SERVICE, ACTOR, "session_access_token", "act_sub", "ops-access"]) {
            expect(text).not.toContain(secret);
            expect(headersText(res)).not.toContain(secret);
        }
        expect(res.headers.get("location")).toBeNull();
    });
});

describe("a credentials sign-in under eddsa", () => {
    it("holds the session token in the sealed session cookie only: no URL, redirect or other cookie carries it", async () => {
        const exp = Math.floor(Date.now() / 1000) + 3000;
        const access = mint("dev-health-api", exp, { act: { sub: ACTOR } });
        const service = mint("auth-service", exp);
        vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "eddsa");
        vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
        fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === `${BACKEND}/api/v1/auth/login`) {
                return new Response(
                    JSON.stringify({
                        access_token: access,
                        refresh_token: "ops-refresh-1",
                        expires_in: 3000,
                        needs_onboarding: false,
                        user: {
                            id: "user-1",
                            email: "a@example.test",
                            org_id: "o1",
                            role: "admin",
                        },
                        session_access_token: service,
                    }),
                    { status: 200, headers: { "content-type": "application/json" } },
                );
            }
            if (url === `${ISSUER}/.well-known/openid-configuration`) {
                return new Response(
                    JSON.stringify({
                        issuer: ISSUER,
                        jwks_uri: `${ISSUER}/.well-known/jwks.json`,
                        id_token_signing_alg_values_supported: ["EdDSA"],
                    }),
                );
            }
            if (url === `${ISSUER}/.well-known/jwks.json`) {
                return new Response(
                    JSON.stringify({
                        keys: [
                            {
                                kty: "OKP",
                                crv: "Ed25519",
                                alg: "EdDSA",
                                use: "sig",
                                kid: "kid-1",
                                x: publicKey.export({ format: "jwk" }).x,
                            },
                        ],
                    }),
                );
            }
            throw new Error(`unexpected fetch ${url}`);
        });

        const csrfRes = await GET(new NextRequest(`${ORIGIN}/api/auth/csrf`));
        const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
        const csrfCookie = csrfRes.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .find((c) => c.startsWith("authjs.csrf-token="));
        const res = await POST(
            new NextRequest(`${ORIGIN}/api/auth/callback/credentials`, {
                method: "POST",
                headers: {
                    cookie: String(csrfCookie),
                    "content-type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    csrfToken,
                    email: "a@example.test",
                    password: "pw",
                    callbackUrl: `${ORIGIN}/dashboard`,
                }).toString(),
            }),
        );
        vi.unstubAllEnvs();
        vi.stubEnv("AUTH_SECRET", SECRET);
        vi.stubEnv("AUTH_URL", `${ORIGIN}/api/auth`);
        vi.stubEnv("BACKEND_URL", BACKEND);

        const cookies = res.headers.getSetCookie();
        const sealed = cookies.filter((c) => c.startsWith(`${COOKIE}=`));
        expect(sealed).toHaveLength(1);
        const others = cookies.filter((c) => !c.startsWith(`${COOKIE}=`));
        const everything = `${headersText(res)}\n${await res.text()}`;
        for (const secret of [service, access, ACTOR]) {
            expect(others.join("\n")).not.toContain(secret);
            expect(everything).not.toContain(secret);
        }
        expect(res.headers.get("location") ?? "").not.toContain(service);
        const token = await decode({
            secret: SECRET,
            salt: COOKIE,
            token: sealed[0].split(";")[0].slice(COOKIE.length + 1),
        });
        expect(token).toMatchObject({ session_access_token: service, act_sub: ACTOR });
    });
});
