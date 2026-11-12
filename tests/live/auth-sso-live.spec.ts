/** UI single sign-on (OIDC and SAML) against auth-service and the ops IdP stand-in (idpstub). */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
    authHeaders,
    envFault,
    liveBackendUrl,
    loginUser,
    registerUser,
    stackVerb,
    testEmail,
    verifyUserViaStack,
} from "./helpers";

// One owner, two providers, one stack: the cells run in order and spend no retries (the budget is small).
test.describe.configure({ mode: "serial", retries: 0 });
test.setTimeout(180_000);

const WEB = "http://127.0.0.1:3002";
const IDP = "https://localhost:9443";
const ownerPassword = "TestPass123!TestPass123!";
const suffix = `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
const allowedDomain = "sso-idp.example.test";
const clientId = `live-oidc-${suffix}`;
const clientSecret = `live-secret-${randomBytes(16).toString("hex")}`;
const idpEmail = (local: string, domain = allowedDomain) => `${local}-${suffix}@${domain}`;

let ownerToken = "";
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

/** The IdP stand-in's current SAML signing certificate (it is generated at every start). */
function idpSamlCert(): string {
    return readFileSync(join(stackState(), "idp", "saml-cert.pem"), "utf8");
}

/** Restart the IdP with one default user. The OIDC redirect allow-list is exact, so it names the provider ids. */
function restartIdp(email: string, ids?: { oidc: string; saml: string }): void {
    const redirect = ids
        ? `${WEB}/api/v1/auth/oidc/${ids.oidc}/callback`
        : `${WEB}/api/v1/auth/oidc/pending/callback`;
    const acs = ids
        ? `${WEB}/api/v1/auth/saml/${ids.saml}/acs`
        : `${WEB}/api/v1/auth/saml/pending/acs`;
    stackVerb("stop-idp");
    stackVerb(
        "start-idp",
        "-client-id",
        clientId,
        "-client-secret",
        clientSecret,
        "-redirect-uri",
        redirect,
        "-acs-url",
        acs,
        "-user",
        `sub-${suffix},${email},SSO Live User`,
    );
}

function providerBody(protocol: "oidc" | "saml", cert: string) {
    const common = {
        name: `live-${protocol}-${suffix}`,
        protocol,
        auto_provision_users: true,
        default_role: "member",
        allowed_domains: [allowedDomain],
    };
    return protocol === "oidc"
        ? {
              ...common,
              oidc_config: { client_id: clientId, client_secret: clientSecret, issuer: IDP },
          }
        : {
              ...common,
              saml_config: {
                  entity_id: `${IDP}/saml/metadata`,
                  sso_url: `${IDP}/saml/sso`,
                  certificate: cert,
              },
          };
}

async function createProvider(
    request: APIRequestContext,
    protocol: "oidc" | "saml",
    cert: string,
): Promise<string> {
    const created = await request.post(`${liveBackendUrl}/api/v1/auth/sso/providers`, {
        headers: authHeaders(ownerToken),
        data: providerBody(protocol, cert),
    });
    expect([200, 201], `create ${protocol} provider: ${String(created.status())}`).toContain(
        created.status(),
    );
    const id = ((await created.json()) as { id?: string }).id ?? "";
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const activated = await request.post(
        `${liveBackendUrl}/api/v1/auth/sso/providers/${id}/activate`,
        {
            headers: authHeaders(ownerToken),
        },
    );
    expect(activated.status(), `activate ${protocol} provider`).toBe(200);
    return id;
}

/** The IdP signs with a new key at every start: register the current certificate with the SAML provider. */
async function refreshSamlCert(request: APIRequestContext): Promise<void> {
    const patched = await request.patch(`${liveBackendUrl}/api/v1/auth/sso/providers/${samlId}`, {
        headers: authHeaders(ownerToken),
        data: {
            saml_config: {
                entity_id: `${IDP}/saml/metadata`,
                sso_url: `${IDP}/saml/sso`,
                certificate: idpSamlCert(),
            },
        },
    });
    expect(patched.status(), "update the SAML provider certificate").toBe(200);
}

async function sessionEmail(page: Page): Promise<string | undefined> {
    const response = await page.request.get("/api/auth/session");
    if (!response.ok()) return undefined;
    const body = (await response.json()) as { user?: { email?: string } } | null;
    return body?.user?.email;
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

/** A refusal lands on the sign-in page with an sso_* error code and no session. */
async function expectRefused(page: Page) {
    await expect(page).toHaveURL(/\/auth\/signin\?(?:.*&)?error=sso_[a-z_]+/u, { timeout: 90_000 });
    expect(await sessionEmail(page)).toBeUndefined();
}

test.describe("@auth-sso single sign-on", () => {
    test("an organization owner registers an OIDC and a SAML provider", async ({ request }) => {
        const ownerEmail = testEmail("sso-owner");
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

        // The SAML provider needs the IdP certificate and the redirect allow-list needs the provider ids: start the IdP
        // once to read the certificate, create both providers, then restart it with the real URLs and register its new key.
        restartIdp(idpEmail("seed"));
        const cert = idpSamlCert();
        oidcId = await createProvider(request, "oidc", cert);
        samlId = await createProvider(request, "saml", cert);
        restartIdp(idpEmail("alice"), { oidc: oidcId, saml: samlId });
        await refreshSamlCert(request);
    });

    test("OIDC: the sign-in page takes the provider id and signs the IdP user in", async ({
        page,
    }) => {
        await startSso(page, "oidc", oidcId);
        await expectSignedInAs(page, idpEmail("alice"));
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
    });

    test("SAML: a captured assertion posted again with its own login cookie is refused", async ({
        playwright,
    }) => {
        expect(capturedAcs, "the sign-in cell captured no assertion post").toBeDefined();
        const replay = await playwright.request.newContext({ baseURL: WEB });
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
            expect(response.headers().location ?? "").toMatch(
                /\/auth\/signin\?(?:.*&)?error=sso_/u,
            );
        } finally {
            await replay.dispose();
        }
    });

    test("OIDC: a callback with a forged code and state is refused", async ({ page }) => {
        await page.goto(`/api/v1/auth/oidc/${oidcId}/callback?code=forged&state=forged`);
        await expectRefused(page);
    });

    test("OIDC: a forged code with the real state of a started flow is refused", async ({
        page,
    }) => {
        await page.route(`${IDP}/authorize*`, (route) => {
            const query = new URL(route.request().url()).searchParams;
            const target = new URL(query.get("redirect_uri") ?? "");
            target.searchParams.set("code", "forged");
            target.searchParams.set("state", query.get("state") ?? "");
            return route.fulfill({ status: 302, headers: { location: target.toString() } });
        });
        await startSso(page, "oidc", oidcId);
        await expectRefused(page);
    });

    test("a provider id nobody registered is refused", async ({ page }) => {
        await startSso(page, "oidc", "00000000-0000-4000-8000-000000000001");
        await expectRefused(page);
    });

    test("a provider id that is not an id stops on the sign-in page", async ({ page }) => {
        await startSso(page, "oidc", "not-an-id");
        await expect(
            page.getByText("Enter the provider ID your administrator shared.", { exact: true }),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/auth\/signin(?:\?|$)/u);
    });

    test("OIDC and SAML: an IdP user outside the allowed domains is refused", async ({
        page,
        request,
    }) => {
        restartIdp(idpEmail("mallory", "other-domain.example.test"), {
            oidc: oidcId,
            saml: samlId,
        });
        await refreshSamlCert(request);
        await startSso(page, "oidc", oidcId);
        await expectRefused(page);
        await startSso(page, "saml", samlId);
        await expectRefused(page);
    });
});
