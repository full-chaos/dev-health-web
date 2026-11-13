/** UI single sign-on (OIDC and SAML) against auth-service and the ops IdP stand-in (idpstub). */
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
    authHeaders,
    envFault,
    grantPlatformAdminViaStack,
    liveBackendUrl,
    loginUser,
    registerUser,
    stackVerb,
    testEmail,
    userIdByEmail,
    verifyUserViaStack,
} from "./helpers";

// One owner, seeded providers, one stack: the cells run in order and spend no retries (the budget is small).
test.describe.configure({ mode: "serial", retries: 0 });
test.setTimeout(180_000);

// The web origin the browser uses: Next's dev server builds the callback URLs from its own request URL, which names localhost, so
// the browser, the IdP allow-list and the SAML ACS base must all use localhost (cookies are bound to the host).
const WEB = "http://localhost:3002";
const IDP = "https://localhost:9443";
const ownerPassword = "TestPass123!TestPass123!";
const suffix = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
const idpDomain = "sso-idp.example.com";
const clientId = `live-oidc-${suffix}`;
const clientSecret = `live-secret-${randomBytes(16).toString("hex")}`;
const idpEmail = (local: string) => `${local}-${suffix}@${idpDomain}`;

let ownerEmail = "";
let oidcId = "";
let samlId = "";
let capturedAcs: { body: string; cookie: string } | undefined;

function stackState(): string {
    const state = process.env.LIVE_E2E_STACK_STATE;
    if (!state) {
        envFault("LIVE_E2E_STACK_STATE names the ops auth stack state directory");
        return "";
    }
    return state;
}

/**
 * Start the IdP with one default user. The OIDC redirect allow-list is exact, so it names the OIDC provider id. No -acs-url: the
 * IdP then accepts any ACS, and the SAML provider is seeded after the start (its certificate is generated at every start).
 */
function restartIdp(email: string, oidcProviderId: string): void {
    stackVerb("stop-idp");
    stackVerb(
        "start-idp",
        "-client-id",
        clientId,
        "-client-secret",
        clientSecret,
        "-redirect-uri",
        `${WEB}/api/v1/auth/oidc/${oidcProviderId}/callback`,
        "-user",
        `sub-${email},${email},SSO Live User`,
    );
}

/**
 * The provider CRUD routes are not served by go-api (ops internal/api/sso/sso.go:18-20), so a provider is seeded by the ops
 * stack verb into the organization the admin e-mail owns. The client secret goes by environment, never by argument.
 * Returns the provider id the verb printed.
 */
function seedProvider(adminEmail: string, protocol: "oidc" | "saml", name: string): string {
    const script = process.env.LIVE_E2E_STACK_SCRIPT;
    const state = stackState();
    if (!script) {
        envFault("LIVE_E2E_STACK_SCRIPT names the ops auth stack script");
        return "";
    }
    const args =
        protocol === "oidc"
            ? [
                  "-issuer",
                  IDP,
                  "-client-id",
                  clientId,
                  "-authorization-endpoint",
                  `${IDP}/authorize`,
                  "-token-endpoint",
                  `${IDP}/token`,
                  "-userinfo-endpoint",
                  `${IDP}/userinfo`,
                  "-jwks-uri",
                  `${IDP}/jwks`,
                  "-allowed-domains",
                  idpDomain,
              ]
            : [
                  "-entity-id",
                  `${IDP}/saml/metadata`,
                  "-sso-url",
                  `${IDP}/saml/sso`,
                  "-cert-file",
                  join(state, "idp", "saml-cert.pem"),
                  "-sp-entity-id",
                  `urn:live-e2e:sp:${suffix}`,
                  "-acs-base",
                  WEB,
                  "-allowed-domains",
                  idpDomain,
              ];
    let out = "";
    try {
        out = execFileSync(
            "bash",
            [script, "seed-sso-provider", state, adminEmail, protocol, "-name", name, ...args],
            {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
                timeout: 60_000,
                env: { ...process.env, SSO_CLIENT_SECRET: clientSecret },
            },
        );
    } catch {
        // execFileSync errors carry argv and captured output.
        throw new Error(`seeding the ${protocol} provider failed`);
    }
    const id = /^seeded (?:oidc|saml) provider ([0-9a-f-]{36})$/mu.exec(out)?.[1] ?? "";
    expect(id, `the ${protocol} seed printed no provider id`).toMatch(/^[0-9a-f-]{36}$/u);
    return id;
}

/**
 * auth-service admits SSO only when the process licence or the organization's own tier grants sso_saml (ops
 * internal/auth/identity/oidc/entitlement.go:25-29), and only go-api holds a process licence. So the owner's organization is
 * made enterprise through the served admin route (PATCH /api/v1/admin/orgs/{id}, platform admin) with the session of a dedicated
 * platform admin: a user made admin by the stack verb grant-platform-admin and signed in by the API login helper.
 */
async function makeOrganizationEnterprise(
    request: APIRequestContext,
    owner: string,
): Promise<void> {
    const adminEmail = testEmail("sso-platform-admin");
    await registerUser(request, adminEmail, ownerPassword);
    let ready = false;
    try {
        ready = verifyUserViaStack(adminEmail) && grantPlatformAdminViaStack(adminEmail);
    } catch {
        envFault("Platform admin setup failed");
    }
    if (!ready) envFault("Platform admin could not be set up");
    const login = await loginUser(request, adminEmail, ownerPassword);
    const adminToken = typeof login.access_token === "string" ? login.access_token : "";
    expect(adminToken, "the platform admin login gave no access token").not.toBe("");
    const userId = await userIdByEmail(request, owner, adminToken);
    expect(userId, "the owner is not in the admin user list").not.toBe("");
    const orgs = await request.get(`${liveBackendUrl}/api/v1/admin/orgs?limit=100`, {
        headers: authHeaders(adminToken),
    });
    expect(orgs.status(), `listing organizations answered ${String(orgs.status())}`).toBe(200);
    let orgId = "";
    for (const org of (await orgs.json()) as Array<{ id?: string }>) {
        if (!org.id) continue;
        const members = await request.get(`${liveBackendUrl}/api/v1/admin/orgs/${org.id}/members`, {
            headers: authHeaders(adminToken),
        });
        expect(members.status(), `listing members answered ${String(members.status())}`).toBe(200);
        const rows = (await members.json()) as Array<{ user_id?: string }>;
        if (rows.some((row) => row.user_id === userId)) {
            orgId = org.id;
            break;
        }
    }
    expect(orgId, "the owner's organization was not among the newest organizations").not.toBe("");
    const patched = await request.patch(`${liveBackendUrl}/api/v1/admin/orgs/${orgId}`, {
        headers: authHeaders(adminToken),
        data: { tier: "enterprise" },
    });
    expect(
        patched.status(),
        `making the organization enterprise answered ${String(patched.status())}`,
    ).toBe(200);
    expect(((await patched.json()) as { tier?: string }).tier).toBe("enterprise");
}

const authServiceLog = () => join(stackState(), "logs", "auth-service.log");

/** How many lines the auth-service log has now: a cell reads only the lines its own action adds. */
function logMark(): number {
    try {
        // The pieces of a log that ends in a newline include one empty trailing piece: it is not a line.
        return readFileSync(authServiceLog(), "utf8").split("\n").length - 1;
    } catch {
        return 0;
    }
}

type Refusal = { outcome?: string; reason?: string; status?: number } | { reason_code?: string };

/**
 * The first auth-service refusal line written after `since` for one provider, read from its job-local log (the browser only sees
 * the redirect). OIDC (ops internal/auth/identity/oidc/service.go:452) logs "auth oidc: request refused" with route, outcome,
 * reason and status; SAML (internal/auth/identity/saml/service.go:495) logs "auth saml: sign-in refused" with reason_code.
 * Polls: the line is written when the request is answered.
 */
async function authServiceRefusal(
    since: number,
    protocol: "oidc" | "saml",
    providerId: string,
    route?: "authorize" | "callback",
): Promise<Refusal | undefined> {
    const message =
        protocol === "oidc" ? "auth oidc: request refused" : "auth saml: sign-in refused";
    for (let attempt = 0; attempt < 30; attempt++) {
        let text = "";
        try {
            text = readFileSync(authServiceLog(), "utf8");
        } catch {
            text = "";
        }
        for (const line of text.split("\n").slice(since)) {
            if (!line.includes(message)) continue;
            try {
                const entry = JSON.parse(line) as Record<string, unknown>;
                if (entry.provider_id !== providerId) continue;
                if (route !== undefined && entry.route !== route) continue;
                const found: Refusal =
                    protocol === "oidc"
                        ? {
                              outcome: entry.outcome as string | undefined,
                              reason: entry.reason as string | undefined,
                              status: entry.status as number | undefined,
                          }
                        : { reason_code: entry.reason_code as string | undefined };
                console.log(
                    `DIAG auth-service-refusal ${protocol} ${route ?? "-"}: ${JSON.stringify(found)}`,
                );
                return found;
            } catch {
                // a log line that is not JSON is not ours
            }
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return undefined;
}

async function sessionEmail(page: Page): Promise<string | undefined> {
    const response = await page.request.get("/api/auth/session");
    if (!response.ok()) return undefined;
    const body = (await response.json()) as { user?: { email?: string } } | null;
    return body?.user?.email;
}

// DIAG F-5 (throwaway run, not for merge): the JIT organization and role of the session.
async function diagF5(req: APIRequestContext, who: string): Promise<void> {
    const response = await req.get("/api/auth/session");
    const body = response.ok()
        ? ((await response.json()) as {
              user?: { org_id?: string; role?: string; id?: string };
          } | null)
        : null;
    console.log(
        `DIAG f5 ${who} ${JSON.stringify({ org_id: body?.user?.org_id ?? null, role: body?.user?.role ?? null, id: body?.user?.id ?? null })}`,
    );
}

async function startSso(page: Page, protocol: "oidc" | "saml", providerId: string) {
    await page.goto("/auth/signin");
    await page.getByLabel("Protocol", { exact: true }).selectOption(protocol);
    await page.getByLabel("Provider ID", { exact: true }).fill(providerId);
    await page.getByRole("button", { name: "Continue with single sign-on", exact: true }).click();
}

async function expectSignedInAs(page: Page, email: string) {
    await expect.poll(() => sessionEmail(page), { timeout: 90_000 }).toBe(email);
}

/**
 * A refusal lands on the sign-in page with the exact error code sso_failed (web src/lib/authSso.ts:79-90: every refusal that is
 * not 402, 409, a 403 membership_required or a transient status is sso_failed) and no session.
 */
async function expectRefused(page: Page) {
    await expect(page).toHaveURL(/\/auth\/signin\?(?:.*&)?error=/u, { timeout: 90_000 });
    const code = new URL(page.url()).searchParams.get("error");
    console.log(`DIAG refusal-code: ${String(code)}`);
    expect(code).toBe("sso_failed");
    expect(await sessionEmail(page)).toBeUndefined();
}

test.describe("@auth-sso single sign-on", () => {
    test("an organization owner has an OIDC and a SAML provider seeded", async ({ request }) => {
        ownerEmail = testEmail("sso-owner");
        await registerUser(request, ownerEmail, ownerPassword);
        let verified = false;
        try {
            verified = verifyUserViaStack(ownerEmail);
        } catch {
            envFault("Owner verification failed");
        }
        if (!verified) envFault("Owner could not be verified");
        await makeOrganizationEnterprise(request, ownerEmail);
        // The owner's own organization is the one register created: the verb seeds into the earliest membership of the e-mail.
        oidcId = seedProvider(ownerEmail, "oidc", `live-oidc-${suffix}`);
        restartIdp(idpEmail("alice"), oidcId);
        samlId = seedProvider(ownerEmail, "saml", `live-saml-${suffix}`);
        const csrf = await request.get("/api/auth/csrf");
        const { csrfToken } = (await csrf.json()) as { csrfToken: string };
        await request.post("/api/auth/callback/credentials", {
            form: {
                csrfToken,
                email: ownerEmail,
                password: ownerPassword,
                callbackUrl: "/dashboard",
            },
            maxRedirects: 0,
        });
        await diagF5(request, "owner");
    });

    // NOT PROVEN END TO END: the auth-service OIDC client refuses a loopback IdP by design (ops internal/auth/identity/oidc/discovery.go:26
    // uses externalurl.GuardedTransport, internal/api/externalurl/externalurl.go:94-131, no allow list), so the code exchange and the
    // sign-in cannot complete against the loopback stand-in. This cell asserts the journey up to the callback and pins the refusal.
    test("OIDC: the IdP redirects back to the web callback and auth-service refuses the token fetch", async ({
        page,
    }) => {
        const callback = `/api/v1/auth/oidc/${oidcId}/callback`;
        const mark = logMark();
        const authorize = page.waitForResponse((res) => res.url().startsWith(`${IDP}/authorize`));
        const callbackHit = page.waitForRequest(
            (req) => new URL(req.url()).pathname === callback && req.method() === "GET",
        );
        await startSso(page, "oidc", oidcId);
        const answer = await authorize;
        expect(answer.status(), "IdP /authorize status").toBe(302);
        expect(new URL(answer.headers().location ?? "", WEB).pathname).toBe(callback);
        await callbackHit;
        await expect(page).toHaveURL(/\/auth\/signin\?/u, { timeout: 90_000 });
        expect(new URL(page.url()).searchParams.get("error")).toBe("sso_failed");
        expect(await authServiceRefusal(mark, "oidc", oidcId, "callback")).toEqual({
            outcome: "denied",
            reason: "dependency_unavailable",
            status: 400,
        });
        expect(await sessionEmail(page)).toBeUndefined();
    });

    test("SAML: the sign-in page takes the provider id and signs the IdP user in", async ({
        page,
    }) => {
        page.on("request", (req) => {
            if (req.method() === "POST" && new URL(req.url()).pathname.endsWith("/acs")) {
                void req.allHeaders().then((headers) => {
                    capturedAcs = { body: req.postData() ?? "", cookie: headers.cookie ?? "" };
                });
            }
        });
        await startSso(page, "saml", samlId);
        await expectSignedInAs(page, idpEmail("alice"));
        await diagF5(page.request, "alice");
    });

    // The replay guard: auth-service SAML marks an assertion id and its flow as used (ops internal/auth/identity/saml/pgstore.go:83-97
    // answer ErrAssertionReplayed; service.go:475-476 maps ErrAssertionReplayed and ErrFlowConsumed to the reason "replayed";
    // handlers.go:282 refuses it), which the web ACS route turns into error=sso_failed.
    test("SAML: a captured assertion posted again with its own login cookie is refused", async ({
        playwright,
    }) => {
        expect(capturedAcs, "the sign-in cell captured no assertion post").toBeDefined();
        const replay = await playwright.request.newContext({ baseURL: WEB });
        const mark = logMark();
        try {
            const response = await replay.post(`/api/v1/auth/saml/${samlId}/acs`, {
                headers: {
                    "content-type": "application/x-www-form-urlencoded",
                    cookie: capturedAcs?.cookie ?? "",
                },
                data: capturedAcs?.body ?? "",
                maxRedirects: 0,
            });
            expect(response.status()).toBe(303);
            const location = new URL(response.headers().location ?? "", WEB);
            console.log(`DIAG replay-code: ${String(location.searchParams.get("error"))}`);
            expect(location.pathname).toBe("/auth/signin");
            expect(location.searchParams.get("error")).toBe("sso_failed");
            const setCookies = response
                .headersArray()
                .filter((header) => header.name.toLowerCase() === "set-cookie")
                .map((header) => header.value);
            expect(
                setCookies.some((line) => line.includes("session-token")),
                "the refused replay set a session cookie",
            ).toBe(false);
            const jar = (await replay.storageState()).cookies;
            expect(jar.some((cookie) => cookie.name.includes("session-token"))).toBe(false);
            expect(await authServiceRefusal(mark, "saml", samlId)).toEqual({
                reason_code: "replayed",
            });
        } finally {
            await replay.dispose();
        }
    });

    // The sealed state does not open (oidc/service.go:466-473): malformed, answered 400.
    test("OIDC: a callback with a forged code and state is refused", async ({ page }) => {
        const mark = logMark();
        await page.goto(`/api/v1/auth/oidc/${oidcId}/callback?code=forged&state=forged`);
        await expectRefused(page);
        expect(await authServiceRefusal(mark, "oidc", oidcId, "callback")).toEqual({
            outcome: "denied",
            reason: "malformed",
            status: 400,
        });
    });

    test("OIDC: with the real state of a started flow the guard refuses the token fetch (the forged code is never judged)", async ({
        page,
    }) => {
        const mark = logMark();
        await page.route(`${IDP}/authorize*`, (route) => {
            const query = new URL(route.request().url()).searchParams;
            const target = new URL(query.get("redirect_uri") ?? "");
            target.searchParams.set("code", "forged");
            target.searchParams.set("state", query.get("state") ?? "");
            return route.fulfill({ status: 302, headers: { location: target.toString() } });
        });
        await startSso(page, "oidc", oidcId);
        await expectRefused(page);
        expect(await authServiceRefusal(mark, "oidc", oidcId, "callback")).toEqual({
            outcome: "denied",
            reason: "dependency_unavailable",
            status: 400,
        });
    });

    // admit() answers an unknown provider 404 with reason malformed (oidc/service.go:236-238).
    test("a provider id nobody registered is refused", async ({ page }) => {
        const unknown = "00000000-0000-4000-8000-000000000001";
        const mark = logMark();
        await startSso(page, "oidc", unknown);
        await expectRefused(page);
        expect(await authServiceRefusal(mark, "oidc", unknown, "authorize")).toEqual({
            outcome: "denied",
            reason: "malformed",
            status: 404,
        });
    });

    test("a provider id that is not an id stops on the sign-in page", async ({ page }) => {
        await startSso(page, "oidc", "not-an-id");
        await expect(
            page.getByText("Enter the provider ID your administrator shared.", { exact: true }),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/auth\/signin(?:\?|$)/u);
    });

    // SAML only: an OIDC domain check runs after the code exchange, which the loopback guard refuses (see the OIDC cell above).
    test("SAML: an IdP user outside the allowed domains is refused", async ({ page }) => {
        // A restart gives the IdP a new SAML key: a second SAML provider is seeded after it.
        restartIdp(`mallory-${suffix}@other-domain.example.com`, oidcId);
        const samlTwo = seedProvider(ownerEmail, "saml", `live-saml2-${suffix}`);
        const mark = logMark();
        await startSso(page, "saml", samlTwo);
        await expectRefused(page);
        expect(await authServiceRefusal(mark, "saml", samlTwo)).toEqual({
            reason_code: "domain_not_allowed",
        });
    });

    test("SAML: a second IdP user in the allowed domain signs in as their own account", async ({
        page,
    }) => {
        restartIdp(idpEmail("bob"), oidcId);
        const samlThree = seedProvider(ownerEmail, "saml", `live-saml3-${suffix}`);
        await startSso(page, "saml", samlThree);
        await expectSignedInAs(page, idpEmail("bob"));
        await diagF5(page.request, "bob");
    });
});
