/**
 * CHAOS-13105: byte budget of the web session cookie. The sealed session (Auth.js JWE) is split into
 * ~4 KB chunks. The response that sets it must pass the proxy's response-header buffer
 * (nginx proxy_buffer_size, 32k now, 4k before: the 502 "upstream sent too big header" of
 * 2026-11-05), and the browser sends every chunk back in ONE `Cookie:` request header line, which
 * nginx refuses over one `large_client_header_buffers` buffer (8k: 400 "Request Header Or Cookie
 * Too Large"). This runs the REAL Auth.js handlers and the real jwt callback of `@/lib/auth`: a
 * credentials sign-in under class eddsa with the three tokens the login answer carries (access
 * token, refresh token, session_access_token), then the session read with the cookie the
 * browser holds. The tokens are the output of the real ops minter (authapi.Issuer.Tokens over
 * token.NewFileSigner, issuer https://auth.fullchaos.dev, throwaway key); the refresh credential
 * has the real shape (`dhr1_` + base64url of 32 bytes, ops internal/auth/session/credential.go).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decode } from "next-auth/jwt";
import { NextRequest } from "next/server";

const SECRET = "chaos-13105-cookie-bytes-test-secret";
const ORIGIN = "https://app.fullchaos.dev";
const ISSUER = "https://auth.fullchaos.dev";
const BACKEND = "http://auth.backend.test";
// https origin: Auth.js uses the secure names (cookies.js defaultCookies, secure prefix).
const SESSION_COOKIE = "__Secure-authjs.session-token";
// iat of the fixture tokens (1793897790) + 10 s: the clock the tokens are valid at.
const CLOCK_MS = 1_793_897_800_000;

// Real producer output, signed with a throwaway key (not secrets). Test-only fixture: keep in step
// with ops internal/auth/authapi issuer_eddsa.go mintFor.
const JWKS_X = "ElZkp9azFojIpkyfPW-eVXob3YS7_5U5lF1IYt4XtYE";
const ACCESS_ORG =
    "eyJhbGciOiJFZERTQSIsImtpZCI6ImsxIiwidHlwIjoiYXQrand0In0.eyJpc3MiOiJodHRwczovL2F1dGguZnVsbGNoYW9zLmRldiIsImF1ZCI6ImRldi1oZWFsdGgtYXBpIiwic3ViIjoicHJuXzAxVGd0TWhTUjBDWmhXZnNkTU53OFEiLCJwcmluY2lwYWxfdHlwZSI6Imh1bWFuIiwic2lkIjoic2VzX2g4Vzd2aDNPUjZ1UWlkSVJVSFphTHciLCJqdGkiOiI1YmEzNWFlMy1jMDQzLTQzZDctYjNjYy1hZmVkMTI3NTk2MDQiLCJpYXQiOjE3OTM4OTc3OTAsIm5iZiI6MTc5Mzg5Nzc5MCwiZXhwIjoxNzkzOTAxMzkwLCJvcmdfaWQiOiI3YjdhMWYwOS1lYTdhLTRmOWEtYmM0OS0xNjM5ODE4YWI2ZDQiLCJzY29wZSI6ImFwaTphY2Nlc3MifQ.tvh5LV47nTZAfavJREtl1yNSm2ZgJSAaJVaEMqUopTkKN0k12dydZkqjLjHGayeg6aJxVXGKO5zQ6c9MxxzkCw";
const SESSION_ORG =
    "eyJhbGciOiJFZERTQSIsImtpZCI6ImsxIiwidHlwIjoiYXQrand0In0.eyJpc3MiOiJodHRwczovL2F1dGguZnVsbGNoYW9zLmRldiIsImF1ZCI6ImF1dGgtc2VydmljZSIsInN1YiI6InBybl8wMVRndE1oU1IwQ1poV2ZzZE1OdzhRIiwicHJpbmNpcGFsX3R5cGUiOiJodW1hbiIsInNpZCI6InNlc19oOFc3dmgzT1I2dVFpZElSVUhaYUx3IiwianRpIjoiYmE0YzYxZmQtMjU3YS00ODgzLWE1ZWMtYWQ5NmQ0NTRhYzhmIiwiaWF0IjoxNzkzODk3NzkwLCJuYmYiOjE3OTM4OTc3OTAsImV4cCI6MTc5MzkwMTM5MCwib3JnX2lkIjoiN2I3YTFmMDktZWE3YS00ZjlhLWJjNDktMTYzOTgxOGFiNmQ0Iiwic2NvcGUiOiJhdXRoOnNlc3Npb24ifQ.PEeIu7NIo04h7YwZ_s00Eie2CuAnr-tWDNt4Dc6Hbxva3d-MuSqDBGtfbFv4ImjNUOYnlCAKvb2la9R6hPtnDA";
const REFRESH = "dhr1_p6hkTBfKBmmhg7fSNkCibYvkyeGp_rGYU8d14F9lziY";

type Route = (req: NextRequest) => Promise<Response>;
let GET: Route;
let POST: Route;
const fetchMock = vi.fn();

beforeAll(async () => {
    vi.stubEnv("AUTH_SECRET", SECRET);
    vi.stubEnv("AUTH_URL", `${ORIGIN}/api/auth`);
    vi.stubEnv("BACKEND_URL", BACKEND);
    vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "eddsa");
    vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ toFake: ["Date"], now: CLOCK_MS });
    ({ GET, POST } = (await import("../route")) as unknown as { GET: Route; POST: Route });
}, 120_000);

afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const lineBytes = (name: string, value: string) => Buffer.byteLength(`${name}: ${value}\r\n`);

interface Shape {
    requestBudget: number;
    responseBudget: number;
    email: string;
    role: string;
    callbackUrl: string;
    otherCookies: string[];
}

function loginAnswer(shape: Shape) {
    return {
        access_token: ACCESS_ORG,
        refresh_token: REFRESH,
        expires_in: 3600,
        needs_onboarding: false,
        user: {
            id: "d354e0b4-c852-4740-9985-67ec74c370f1",
            email: shape.email,
            org_id: "7b7a1f09-ea7a-4f9a-bc49-1639818ab6d4",
            role: shape.role,
            is_superuser: false,
        },
        session_access_token: SESSION_ORG,
    };
}

function backend(shape: Shape) {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${BACKEND}/api/v1/auth/login`) {
            return new Response(JSON.stringify(loginAnswer(shape)), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
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
                            kid: "k1",
                            x: JWKS_X,
                        },
                    ],
                }),
            );
        }
        throw new Error(`unexpected fetch ${url}`);
    });
}

const pair = (setCookie: string) => setCookie.split(";")[0];

/** The browser's sign-in: csrf, the credentials callback, then a session read with what it holds. */
async function signIn(shape: Shape) {
    backend(shape);
    const csrfRes = await GET(new NextRequest(`${ORIGIN}/api/auth/csrf`));
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const jar = new Map<string, string>();
    for (const c of csrfRes.headers.getSetCookie()) {
        const [name, ...rest] = pair(c).split("=");
        jar.set(name, rest.join("="));
    }
    const cookie = () => [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
    const res = await POST(
        new NextRequest(`${ORIGIN}/api/auth/callback/credentials`, {
            method: "POST",
            headers: {
                cookie: cookie(),
                "content-type": "application/x-www-form-urlencoded",
                "x-auth-return-redirect": "1",
            },
            body: new URLSearchParams({
                csrfToken,
                email: shape.email,
                password: "pw",
                callbackUrl: shape.callbackUrl,
            }).toString(),
        }),
    );
    const setCookies = res.headers.getSetCookie();
    for (const c of setCookies) {
        const [name, ...rest] = pair(c).split("=");
        // An empty value is a deletion: the browser keeps nothing under that name.
        if (rest.join("=") === "") jar.delete(name);
        else jar.set(name, rest.join("="));
    }
    const sessionChunks = setCookies.filter((c) => c.startsWith(`${SESSION_COOKIE}`));
    const setCookieBytes = setCookies.reduce((sum, c) => sum + lineBytes("set-cookie", c), 0);
    const browserCookie = [cookie(), ...shape.otherCookies].join("; ");
    const readBack = await GET(
        new NextRequest(`${ORIGIN}/api/auth/session`, { headers: { cookie: browserCookie } }),
    );
    return {
        status: res.status,
        sessionChunks,
        setCookieBytes,
        requestCookieBytes: Buffer.byteLength(`cookie: ${browserCookie}\r\n`),
        readBack,
        browserCookie,
        jar,
    };
}

// Budgets are bytes, set from the measured numbers (2026-11-05) with about 10% headroom, so a new
// JWT-sized field in the session turns the test red long before the proxy limits are reached:
// nginx proxy_buffer_size 32k (4k before) for the response header block, 8k for the request
// Cookie line (large_client_header_buffers 4 8k). Raising one needs a re-measure and a look at both.
// Hard limits: request Cookie line 8192 = nginx large_client_header_buffers 4 8k; response headers 32768 = prod proxy-buffer-size 32k.
// A budget raise must stay under them.
const TYPICAL: Shape = {
    requestBudget: 3072, // measured 2777 B
    responseBudget: 3072, // measured 2754 B
    email: "engineer@example.com",
    role: "admin",
    callbackUrl: `${ORIGIN}/dashboard`,
    otherCookies: [],
};
// Longest realistic variable values: a 254-byte address (RFC 5321 limit), a 1024-byte deep-link
// callback URL, and the one first-party cookie the app adds (SignupCompletedEmitter, 64-hex digest).
const LONGEST: Shape = {
    requestBudget: 4608, // measured 4206 B
    responseBudget: 4608, // measured 4088 B
    email: `${"l".repeat(64)}@${"d".repeat(63)}.${"d".repeat(63)}.${"d".repeat(58)}.example`,
    role: "organization-administrator",
    callbackUrl: `${ORIGIN}/explore?q=${"x".repeat(1024 - ORIGIN.length - "/explore?q=".length)}`,
    otherCookies: [`devhealth-signup-completed:${"a".repeat(64)}=1`],
};

describe.each([
    ["owned, typical values", TYPICAL],
    ["owned, longest realistic values", LONGEST],
] as const)("session cookie bytes, %s", (_name, shape) => {
    it("sets a sealed cookie that the next request reads back", async () => {
        const out = await signIn(shape);
        expect(out.status).toBe(200);
        expect(out.sessionChunks.length).toBeGreaterThan(0);
        const user = ((await out.readBack.json()) as { user?: { id?: string } }).user;
        expect(user?.id).toBe("d354e0b4-c852-4740-9985-67ec74c370f1");
        const sealed = [...out.jar]
            .filter(([n]) => n.startsWith(SESSION_COOKIE))
            .sort(([a], [b]) => Number(a.split(".").pop()) - Number(b.split(".").pop()))
            .map(([, v]) => v)
            .join("");
        const token = await decode({ secret: SECRET, salt: SESSION_COOKIE, token: sealed });
        expect(token).toMatchObject({
            access_token: ACCESS_ORG,
            refresh_token: REFRESH,
            session_access_token: SESSION_ORG,
        });
    });

    it("keeps the Set-Cookie bytes of the sign-in response under the budget", async () => {
        const { setCookieBytes } = await signIn(shape);
        expect(setCookieBytes).toBeLessThan(shape.responseBudget);
    });

    it("keeps the request Cookie header line under the budget", async () => {
        const { requestCookieBytes } = await signIn(shape);
        expect(requestCookieBytes).toBeLessThan(shape.requestBudget);
    });
});
