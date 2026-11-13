/** UI single sign-on (OIDC and SAML) against auth-service and the ops IdP stand-in (idpstub). */
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
let ownerOrgId = "";
let aliceId = "";
// One line per signed-in user of this run (org, role, id only): the last cell reads it back and checks it holds no secret.
const jitLog = join(tmpdir(), `auth-sso-jit-${suffix}.log`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

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
const idpLog = () => join(stackState(), "logs", "idpstub.log");

/** How many lines the IdP stub log has now (each served request is one "idpstub: <METHOD> <path>" line). */
function idpLogMark(): number {
    return readFileSync(idpLog(), "utf8").split("\n").length - 1;
}

/** The requests the IdP stub served after `since`, as "<METHOD> <path>". */
function idpRequestsSince(since: number): string[] {
    return readFileSync(idpLog(), "utf8")
        .split("\n")
        .slice(since)
        .filter((line) => line.startsWith("idpstub: "))
        .map((line) => line.slice("idpstub: ".length));
}

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

type SessionUser = { email?: string; org_id?: string; role?: string; id?: string };

async function sessionUser(req: APIRequestContext): Promise<SessionUser | undefined> {
    const response = await req.get("/api/auth/session");
    if (!response.ok()) return undefined;
    return ((await response.json()) as { user?: SessionUser } | null)?.user;
}

function recordJit(who: string, user: SessionUser | undefined): void {
    const line = `JIT ${who} ${JSON.stringify({ org_id: user?.org_id ?? null, role: user?.role ?? null, id: user?.id ?? null })}`;
    appendFileSync(jitLog, `${line}\n`);
    console.log(line);
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
        // The providers' organization: the seed verb puts them in the owner's earliest membership (ops ssoseedverb.go:105).
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
        const owner = await sessionUser(request);
        recordJit("owner", owner);
        expect(owner?.email, "the owner password sign-in made no session").toBe(ownerEmail);
        expect(owner?.role).toBe("owner");
        expect(owner?.org_id).toMatch(UUID);
        ownerOrgId = owner?.org_id ?? "";
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
        // JIT: a new IdP account joins the PROVIDER's organization (ops internal/auth/identity/saml/pgjit.go:74) with the provider
        // row's role through SignInRole (pgjit.go:26; the seed verb's default "member").
        const alice = await sessionUser(page.request);
        recordJit("alice", alice);
        expect(alice?.org_id, "alice: the session organization").toBe(ownerOrgId);
        expect(alice?.role, "alice: the session role").toBe("member");
        expect(alice?.id).toMatch(UUID);
        aliceId = alice?.id ?? "";
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

    // The forged code must reach the IdP token endpoint without the browser ever visiting the IdP. The IdP authorize URL is the 303
    // target of web's start route (src/lib/authSsoRoutes.ts:77), and Playwright routes only the first URL of a redirect chain, so the
    // start route itself is routed: its 303 keeps its cookies (the flow binding) and goes straight to the callback with the real state
    // and a forged code. With SSO_EGRESS_ALLOW_CIDRS set in the job (ops ci/live_e2e_auth_stack.sh enable_sso), auth-service sends that
    // code to the IdP token endpoint, which answers invalid_grant (ops internal/testsupport/idpstub/oidc.go:393); auth-service maps
    // every exchange error to dependency_unavailable (internal/auth/identity/oidc/service.go:546-548). The IdP stub log pins the
    // mechanism: one token request and no authorize request.
    test("OIDC: with the real state of a started flow a forged code is refused at the IdP token endpoint", async ({
        page,
    }) => {
        const mark = logMark();
        const idpMark = idpLogMark();
        let starts = 0;
        await page.route(
            (url) => url.pathname === `/auth/sso/oidc/${oidcId}`,
            async (route) => {
                starts += 1;
                const response = await route.fetch({ maxRedirects: 0 });
                const authorize = new URL(response.headers().location ?? "");
                const target = new URL(authorize.searchParams.get("redirect_uri") ?? "");
                target.searchParams.set("code", "forged");
                target.searchParams.set("state", authorize.searchParams.get("state") ?? "");
                await route.fulfill({
                    response,
                    headers: { ...response.headers(), location: target.toString() },
                });
            },
        );
        await startSso(page, "oidc", oidcId);
        await expect(page).toHaveURL(/\/auth\/signin\?(?:.*&)?error=/u, { timeout: 90_000 });
        const requests = idpRequestsSince(idpMark);
        console.log(`DIAG idp-requests: ${JSON.stringify(requests)}`);
        expect(
            requests.filter((request) => request === "GET /authorize"),
            "the browser visited the IdP authorize page: the forged code was never sent",
        ).toEqual([]);
        expect(
            requests.filter((request) => request === "POST /token"),
            "the IdP token endpoint judged the forged code once",
        ).toEqual(["POST /token"]);
        expect(starts, "the start route was routed once").toBe(1);
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
        // The same JIT pins as alice (pgjit.go:74 organization, pgjit.go:26 role), as an account of its own.
        const bob = await sessionUser(page.request);
        recordJit("bob", bob);
        expect(bob?.org_id, "bob: the session organization").toBe(ownerOrgId);
        expect(bob?.role, "bob: the session role").toBe("member");
        expect(bob?.id).toMatch(UUID);
        expect(bob?.id, "bob signs in as an account of his own, not alice's").not.toBe(aliceId);
    });

    // The full OIDC sign-in past the callback: the job lists the loopback IdP in SSO_EGRESS_ALLOW_CIDRS (ops
    // ci/live_e2e_auth_stack.sh enable_sso), so auth-service's OIDC client (externalurl.IdPTransport) reaches the IdP for the
    // discovery, the code exchange and the keys. A new IdP user (carol): alice already holds her e-mail through SAML, and a second
    // identity for one e-mail is a 409 (internal/auth/identity/oidc/service.go:807-813). It runs last because each IdP start makes
    // a new SAML certificate, which only the providers seeded after that start trust.
    test("OIDC: a new IdP user signs in past the callback into the provider's organization", async ({
        page,
    }) => {
        restartIdp(idpEmail("carol"), oidcId);
        await startSso(page, "oidc", oidcId);
        await expectSignedInAs(page, idpEmail("carol"));
        // OIDC JIT: the provider row's role through SignInRole (oidc/service.go:664), joined to the provider's organization
        // (oidc/pgjit.go:57, :68); the OIDC provider is seeded in the owner's organization like the SAML ones.
        const carol = await sessionUser(page.request);
        recordJit("carol", carol);
        expect(carol?.org_id, "carol: the session organization").toBe(ownerOrgId);
        expect(carol?.role, "carol: the session role").toBe("member");
        expect(carol?.id).toMatch(UUID);
        expect(carol?.id, "carol signs in as an account of her own, not alice's").not.toBe(aliceId);
    });

    test("the JIT lines of this run hold the four users and no secret", async () => {
        const lines = readFileSync(jitLog, "utf8")
            .split("\n")
            .filter((line) => line !== "");
        expect(lines, "the JIT lines of the owner, alice, bob and carol").toHaveLength(4);
        const shape =
            /^JIT (owner|alice|bob|carol) \{"org_id":"[0-9a-f-]{36}","role":"(owner|member)","id":"[0-9a-f-]{36}"\}$/u;
        for (const line of lines) expect(line).toMatch(shape);
        const text = lines.join("\n");
        for (const secret of [
            ownerPassword,
            clientSecret,
            "eyJ",
            "token",
            "cookie",
            "secret",
            "password",
        ]) {
            expect(text.toLowerCase()).not.toContain(secret.toLowerCase());
        }
    });
});
