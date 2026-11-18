/** UI single sign-on (OIDC and SAML) against auth-service and the ops IdP stand-in (idpstub). */
import { randomBytes } from "node:crypto";
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

// One owner, providers made through the provider route, one stack: the cells run in order and spend no retries (the budget is small).
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
let ownerToken = "";
let oidcId = "";
let samlId = "";
let samlTwo = "";
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
 * IdP then accepts any ACS, and the SAML provider is created after the start (its certificate is generated at every start).
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

const providersUrl = `${liveBackendUrl}/api/v1/auth/sso/providers`;

/** The provider body the route takes (ops internal/api/sso/validate.go ssoProviderCreate) for the job's IdP stand-in. */
function providerBody(protocol: "oidc" | "saml", name: string): Record<string, unknown> {
    const common = {
        name,
        protocol,
        default_role: "member",
        auto_provision_users: true,
        allowed_domains: [idpDomain],
    };
    if (protocol === "oidc") {
        return {
            ...common,
            oidc_config: {
                client_id: clientId,
                client_secret: clientSecret,
                issuer: IDP,
                authorization_endpoint: `${IDP}/authorize`,
                token_endpoint: `${IDP}/token`,
                userinfo_endpoint: `${IDP}/userinfo`,
                jwks_uri: `${IDP}/jwks`,
            },
        };
    }
    // No sp_entity_id or sp_acs_url: the model has neither, so auth-service builds both from APP_BASE_URL (ops
    // internal/auth/identity/saml/config.go SPEntityID, ACSURL), which the job sets to the browser origin (LIVE_E2E_WEB_ORIGIN).
    return {
        ...common,
        saml_config: {
            entity_id: `${IDP}/saml/metadata`,
            sso_url: `${IDP}/saml/sso`,
            certificate: readFileSync(join(stackState(), "idp", "saml-cert.pem"), "utf8"),
        },
    };
}

type ProviderAnswer = {
    id?: string;
    org_id?: string;
    name?: string;
    protocol?: string;
    status?: string;
    default_role?: string;
    config?: Record<string, unknown>;
};

/**
 * The owner creates a provider through go-api's route (which calls auth-service, the providers' one writer) and activates it: a
 * created provider is pending_setup (ops internal/auth/ssoprovider/ssoprovider.go Create) and only an active one signs in.
 * Returns the provider id.
 */
async function createProvider(
    request: APIRequestContext,
    protocol: "oidc" | "saml",
    name: string,
): Promise<string> {
    const created = await request.post(providersUrl, {
        headers: authHeaders(ownerToken),
        data: providerBody(protocol, name),
    });
    const text = await created.text();
    expect(
        created.status(),
        `creating the ${protocol} provider answered ${String(created.status())}`,
    ).toBe(201);
    expect(text, "the create answer holds the client secret").not.toContain(clientSecret);
    const provider = JSON.parse(text) as ProviderAnswer;
    expect(provider.id).toMatch(UUID);
    expect(provider).toMatchObject({
        name,
        protocol,
        status: "pending_setup",
        default_role: "member",
    });
    if (protocol === "oidc") {
        // auth-service seals the secret into encrypted_secrets and keeps it out of the stored config (ops
        // internal/auth/authapi/provisioning_sso.go buildConfig; oidcConfigMembers has no client_secret), so the answer has none.
        expect(provider.config?.client_id).toBe(clientId);
        expect(
            provider.config,
            "the OIDC config answer holds a client_secret member",
        ).not.toHaveProperty("client_secret");
    }
    const id = provider.id ?? "";
    const activated = await request.post(`${providersUrl}/${id}/activate`, {
        headers: authHeaders(ownerToken),
    });
    expect(
        activated.status(),
        `activating the ${protocol} provider answered ${String(activated.status())}`,
    ).toBe(200);
    expect(((await activated.json()) as ProviderAnswer).status).toBe("active");
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
    // go-api runs with no process licence, as prod (community tier), so the provider routes admit a caller by its organization's
    // own enterprise entitlement only (ops internal/api/sso/gate.go providerGate, product rule C1): the owner of a new
    // (community) organization is refused with the legacy 402, before any write.
    test("the owner of a community organization is refused a provider create with 402", async ({
        request,
    }) => {
        ownerEmail = testEmail("sso-owner");
        await registerUser(request, ownerEmail, ownerPassword);
        let verified = false;
        try {
            verified = verifyUserViaStack(ownerEmail);
        } catch {
            envFault("Owner verification failed");
        }
        if (!verified) envFault("Owner could not be verified");
        const login = await loginUser(request, ownerEmail, ownerPassword);
        ownerToken = typeof login.access_token === "string" ? login.access_token : "";
        expect(ownerToken, "the owner login gave no access token").not.toBe("");
        const refused = await request.post(providersUrl, {
            headers: authHeaders(ownerToken),
            data: providerBody("oidc", `live-oidc-refused-${suffix}`),
        });
        expect(
            refused.status(),
            `a community organization's create answered ${String(refused.status())}`,
        ).toBe(402);
        expect(((await refused.json()) as { detail?: unknown }).detail).toEqual({
            error: "feature_not_licensed",
            feature: "sso_saml",
            required_tier: "enterprise",
            current_tier: "community",
        });
        const listed = await request.get(providersUrl, { headers: authHeaders(ownerToken) });
        expect(listed.status(), "the community organization's list is refused too").toBe(402);
    });

    test("once the organization is enterprise, the owner creates and activates an OIDC and a SAML provider", async ({
        request,
    }) => {
        await makeOrganizationEnterprise(request, ownerEmail);
        oidcId = await createProvider(request, "oidc", `live-oidc-${suffix}`);
        restartIdp(idpEmail("alice"), oidcId);
        samlId = await createProvider(request, "saml", `live-saml-${suffix}`);
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

    // The two reads: the list (oldest first, ops ssoprovider.go List) and one provider, both in the owner's organization (the
    // token's, never the body's), the SAML certificate masked as the legacy answer showed it.
    test("the owner lists the organization's providers and reads one", async ({ request }) => {
        const listed = await request.get(providersUrl, { headers: authHeaders(ownerToken) });
        expect(listed.status()).toBe(200);
        const page = (await listed.json()) as {
            items?: ProviderAnswer[];
            total?: number;
            limit?: number;
            offset?: number;
        };
        expect(page).toMatchObject({ total: 2, limit: 50, offset: 0 });
        expect((page.items ?? []).map((item) => item.id)).toEqual([oidcId, samlId]);
        for (const item of page.items ?? []) expect(item.org_id).toBe(ownerOrgId);
        const read = await request.get(`${providersUrl}/${samlId}`, {
            headers: authHeaders(ownerToken),
        });
        expect(read.status()).toBe(200);
        const saml = (await read.json()) as ProviderAnswer;
        expect(saml).toMatchObject({
            id: samlId,
            org_id: ownerOrgId,
            protocol: "saml",
            status: "active",
        });
        expect(String(saml.config?.certificate ?? "")).toMatch(/^[\s\S]{50}\.\.\.$/u);
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
        // row's role through SignInRole (pgjit.go:26; the provider's default_role "member").
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
        // A restart gives the IdP a new SAML key: a second SAML provider is created after it.
        restartIdp(`mallory-${suffix}@other-domain.example.com`, oidcId);
        samlTwo = await createProvider(page.request, "saml", `live-saml2-${suffix}`);
        const mark = logMark();
        await startSso(page, "saml", samlTwo);
        await expectRefused(page);
        expect(await authServiceRefusal(mark, "saml", samlTwo)).toEqual({
            reason_code: "domain_not_allowed",
        });
    });

    // The three other writes on the provider the refusal cell used: a rename (only the named member changes), deactivate, and
    // delete (204, after which the provider is not found in the organization).
    test("the owner renames, deactivates and deletes a provider", async ({ request }) => {
        const renamed = await request.patch(`${providersUrl}/${samlTwo}`, {
            headers: authHeaders(ownerToken),
            data: { name: `live-saml2-renamed-${suffix}` },
        });
        expect(renamed.status()).toBe(200);
        expect((await renamed.json()) as ProviderAnswer).toMatchObject({
            id: samlTwo,
            name: `live-saml2-renamed-${suffix}`,
            status: "active",
        });
        const deactivated = await request.post(`${providersUrl}/${samlTwo}/deactivate`, {
            headers: authHeaders(ownerToken),
        });
        expect(deactivated.status()).toBe(200);
        expect(((await deactivated.json()) as ProviderAnswer).status).toBe("inactive");
        const deleted = await request.delete(`${providersUrl}/${samlTwo}`, {
            headers: authHeaders(ownerToken),
        });
        expect(deleted.status()).toBe(204);
        const gone = await request.get(`${providersUrl}/${samlTwo}`, {
            headers: authHeaders(ownerToken),
        });
        expect(gone.status()).toBe(404);
        expect(await gone.json()).toEqual({ detail: "SSO provider not found" });
    });

    test("SAML: a second IdP user in the allowed domain signs in as their own account", async ({
        page,
    }) => {
        restartIdp(idpEmail("bob"), oidcId);
        const samlThree = await createProvider(page.request, "saml", `live-saml3-${suffix}`);
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
    // a new SAML certificate, which only the providers created after that start trust.
    test("OIDC: a new IdP user signs in past the callback into the provider's organization", async ({
        page,
    }) => {
        restartIdp(idpEmail("carol"), oidcId);
        await startSso(page, "oidc", oidcId);
        await expectSignedInAs(page, idpEmail("carol"));
        // OIDC JIT: the provider row's role through SignInRole (oidc/service.go:664), joined to the provider's organization
        // (oidc/pgjit.go:57, :68); the OIDC provider is in the owner's organization like the SAML ones.
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
