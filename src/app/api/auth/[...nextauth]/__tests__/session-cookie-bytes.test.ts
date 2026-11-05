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
// The longest tokens the minter makes (org_id + act.sub, 626 B), same key and run as the above.
const ACCESS_ORG_ACT =
    "eyJhbGciOiJFZERTQSIsImtpZCI6ImsxIiwidHlwIjoiYXQrand0In0.eyJpc3MiOiJodHRwczovL2F1dGguZnVsbGNoYW9zLmRldiIsImF1ZCI6ImRldi1oZWFsdGgtYXBpIiwic3ViIjoicHJuXzAxVGd0TWhTUjBDWmhXZnNkTU53OFEiLCJwcmluY2lwYWxfdHlwZSI6Imh1bWFuIiwic2lkIjoic2VzX2g4Vzd2aDNPUjZ1UWlkSVJVSFphTHciLCJqdGkiOiIzZDFiMjdkMi0yMjYxLTQxMDctYTZkMi0zYjhlYzVhZTYyNDgiLCJpYXQiOjE3OTM4OTc3OTAsIm5iZiI6MTc5Mzg5Nzc5MCwiZXhwIjoxNzkzOTAxMzkwLCJvcmdfaWQiOiI3YjdhMWYwOS1lYTdhLTRmOWEtYmM0OS0xNjM5ODE4YWI2ZDQiLCJhY3QiOnsic3ViIjoicHJuX3Eya25vRnh0U01Tb0FROEdoeDZYY1EifSwic2NvcGUiOiJhcGk6YWNjZXNzIn0.PxRAiV2IMCeuPs9Fbx8CDiifwV3g_zfocCfOBWTjNMfuwCHv2zpIQfZoUZkCOk4KgTu3wpTeHlI0XnqygDNgAw";
const SESSION_ORG_ACT =
    "eyJhbGciOiJFZERTQSIsImtpZCI6ImsxIiwidHlwIjoiYXQrand0In0.eyJpc3MiOiJodHRwczovL2F1dGguZnVsbGNoYW9zLmRldiIsImF1ZCI6ImF1dGgtc2VydmljZSIsInN1YiI6InBybl8wMVRndE1oU1IwQ1poV2ZzZE1OdzhRIiwicHJpbmNpcGFsX3R5cGUiOiJodW1hbiIsInNpZCI6InNlc19oOFc3dmgzT1I2dVFpZElSVUhaYUx3IiwianRpIjoiOWNjNWQ4MDktZjBiYS00ZTc0LTk0N2ItZDhmNGE5MDBkY2I5IiwiaWF0IjoxNzkzODk3NzkwLCJuYmYiOjE3OTM4OTc3OTAsImV4cCI6MTc5MzkwMTM5MCwib3JnX2lkIjoiN2I3YTFmMDktZWE3YS00ZjlhLWJjNDktMTYzOTgxOGFiNmQ0IiwiYWN0Ijp7InN1YiI6InBybl9xMmtub0Z4dFNNU29BUThHaHg2WGNRIn0sInNjb3BlIjoiYXV0aDpzZXNzaW9uIn0.I6Ye42WCFGVmH-lkkwx1AUVgqjSehD1hLFCPdEPnG_4jAktxr23ccrXHDV6Fo45mTv3f-uDV8-qp48qbLM3tCg";

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
    // Optional: a superuser login with other fixture tokens (the impersonation shapes below).
    superuser?: boolean;
    access?: string;
    session?: string;
}

function loginAnswer(shape: Shape) {
    return {
        access_token: shape.access ?? ACCESS_ORG,
        refresh_token: REFRESH,
        expires_in: 3600,
        needs_onboarding: false,
        user: {
            id: "d354e0b4-c852-4740-9985-67ec74c370f1",
            email: shape.email,
            org_id: "7b7a1f09-ea7a-4f9a-bc49-1639818ab6d4",
            role: shape.role,
            is_superuser: shape.superuser ?? false,
        },
        session_access_token: shape.session ?? SESSION_ORG,
    };
}

function backend(shape: Shape) {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${BACKEND}/api/v1/auth/login` || url === `${BACKEND}/api/v1/auth/refresh`) {
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
        if (url === `${BACKEND}/api/v1/admin/impersonate/status`) {
            return new Response(
                JSON.stringify({
                    is_impersonating: true,
                    target_user_id: "0e4f1b7c-9a2d-4c3e-8f61-5d7a2b9c0e13",
                    target_email: shape.email,
                    target_org_id: "a1c2e3f4-b5d6-4e7f-8a9b-0c1d2e3f4a5b",
                }),
                { status: 200, headers: { "content-type": "application/json" } },
            );
        }
        if (url === `${BACKEND}/api/v1/admin/impersonate/stop`) {
            return new Response(JSON.stringify({ detail: "busy" }), { status: 503 });
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

// #1866 (CHAOS-12913): an administrator who impersonates, LONGEST values, the 626 B tokens for every
// JWT (administrator access and service token, delegated access token), a 254-byte target address.
// Budgets of CHAOS-13105 for this shape: request Cookie line 6144 B, Set-Cookie 16384 B.
const IMPERSONATING_ADMIN: Shape = {
    ...LONGEST,
    requestBudget: 6144,
    responseBudget: 16384,
    superuser: true,
    access: ACCESS_ORG_ACT,
    session: SESSION_ORG_ACT,
};

describe("session cookie bytes, administrator impersonating, longest values", () => {
    it("stays under the budget in every impersonation shape", async () => {
        const shape = IMPERSONATING_ADMIN;
        const out = await signIn(shape);
        expect(out.status).toBe(200);
        const csrfRes = await GET(
            new NextRequest(`${ORIGIN}/api/auth/csrf`, { headers: { cookie: out.browserCookie } }),
        );
        const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
        const jar = out.jar;
        const browser = () =>
            [[...jar].map(([n, v]) => `${n}=${v}`).join("; "), ...shape.otherCookies].join("; ");
        const sealed = async () =>
            (await decode({
                secret: SECRET,
                salt: SESSION_COOKIE,
                token: [...jar]
                    .filter(([n]) => n.startsWith(SESSION_COOKIE))
                    .sort(([a], [b]) => Number(a.split(".").pop()) - Number(b.split(".").pop()))
                    .map(([, v]) => v)
                    .join(""),
            })) as Record<string, unknown>;
        const update = async (data: object) => {
            const res = await POST(
                new NextRequest(`${ORIGIN}/api/auth/session`, {
                    method: "POST",
                    headers: { cookie: browser(), "content-type": "application/json" },
                    body: JSON.stringify({ csrfToken, data }),
                }),
            );
            expect(res.status).toBe(200);
            const setCookies = res.headers.getSetCookie();
            for (const c of setCookies) {
                const [name, ...rest] = pair(c).split("=");
                if (rest.join("=") === "") jar.delete(name);
                else jar.set(name, rest.join("="));
            }
            return {
                setCookieBytes: setCookies.reduce((sum, c) => sum + lineBytes("set-cookie", c), 0),
                requestCookieBytes: Buffer.byteLength(`cookie: ${browser()}\r\n`),
            };
        };
        const { sealSessionHandoff } = await import("@/lib/auth");
        const sessionHandoff = await sealSessionHandoff(
            "impersonation",
            // A handoff that still carries the delegated service token: the jwt callback keeps none of
            // it (the start action drops it before the seal as well, impersonationSession.ts).
            {
                access_token: ACCESS_ORG_ACT,
                session_access_token: SESSION_ORG_ACT,
                expires_in: 900,
            },
            "d354e0b4-c852-4740-9985-67ec74c370f1",
        );
        try {
            const shapes: Record<string, { setCookieBytes: number; requestCookieBytes: number }> = {
                signIn: out,
            };
            shapes.impersonating = await update({ sessionHandoff });
            const live = await sealed();
            expect(live.imp_access_token).toBe(ACCESS_ORG_ACT);
            expect(live).not.toHaveProperty("is_impersonating");
            expect(live.imp_access_token).toEqual(expect.any(String));
            expect(live).not.toHaveProperty("imp_session_access_token");
            // The delegated token ends (900 s); the stop answers 503: the delegated state is kept.
            vi.setSystemTime(CLOCK_MS + 16 * 60_000);
            shapes.keptExpired = await update({});
            expect((await sealed()).imp_access_token).toBe(ACCESS_ORG_ACT);
            // The administrator token 4 min from its end: the step refreshes it, the stop fails: kept.
            vi.setSystemTime(CLOCK_MS + 56 * 60_000);
            shapes.keptExpiredAdminNearExpiry = await update({});
            expect((await sealed()).imp_access_token).toBe(ACCESS_ORG_ACT);
            for (const [name, bytes] of Object.entries(shapes)) {
                console.info(
                    `COOKIE-BYTES impersonation ${name} request=${bytes.requestCookieBytes} set_cookie=${bytes.setCookieBytes}`,
                );
                expect(bytes.requestCookieBytes).toBeLessThan(shape.requestBudget);
                expect(bytes.setCookieBytes).toBeLessThan(shape.responseBudget);
            }
        } finally {
            vi.setSystemTime(CLOCK_MS);
        }
    });
});
