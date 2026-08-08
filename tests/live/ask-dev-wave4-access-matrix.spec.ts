/**
 * CHAOS-3219 Phase 4 Lane 4d (CHAOS-3510) — Context Fabric Validation access matrix.
 *
 * Runs ONLY under `playwright.ask-dev-wave4.config.ts`, which throws unless the
 * Ops Compose launcher armed it (CHAOS-3586 supplies the wiring). Real browser,
 * real Auth.js sessions, real Ops REST API — no MSW, no route interception, no
 * dependency override, per Phase 4's "never against dev mocks" constraint.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT COVER. These rows are already owned
 * elsewhere and are NOT re-implemented here; duplicating them beside the
 * originals and calling it new coverage is the inaccurate-coverage-claim
 * failure this epic exists to prevent:
 *
 *   - member denied on the validation route ....... ask-dev-acceptance.spec.ts:654-693
 *   - emergency kill switch collapses capabilities  ask-dev-acceptance.spec.ts:625-637
 *   - validation usable with ask_dev + ACR off .... ask-dev-acceptance.spec.ts:639-652
 *   - ask_dev / byo_llm / ACR decided independently src/lib/dev/__tests__/contracts.test.ts:258-278
 *   - old-route four-way branch selection ......... src/app/(app)/agent-context/
 *                                                   context-packet/page.test.tsx
 *
 * Row A3 pins the CHAOS-3587 ruling (impersonation is intended); see its own
 * block comment. Every identity minted here is unique per run and self-contained, so re-runs
 * cannot pass by inheriting a previous run's state.
 */
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { authHeaders, liveBackendUrl, signInCanonicalUser } from "./helpers";

type JsonObject = Record<string, unknown>;

const WEB_BASE_URL = process.env.ASK_DEV_ACCEPTANCE_WEB_URL ?? "http://127.0.0.1:3002";
const MEMBER_PASSWORD = "DevHealth123!";

/**
 * The org ids this acceptance run provisioned, from
 * prepare_ask_dev_acceptance.py's provision_multi_org(). Read strictly: an
 * unreadable or unrecognised artifact must abort, never degrade into "test the
 * primary org twice", which would look green while proving nothing about
 * cross-tenant entitlement.
 */
function readProvisionedOrgIds(): {
    primaryOrgId: string;
    secondOrgId: string;
    disabledEntitlementOrgId: string;
} {
    const path = process.env.ASK_DEV_ACCEPTANCE_ORG_IDS;
    if (!path?.trim()) {
        throw new Error(
            "ASK_DEV_ACCEPTANCE_ORG_IDS is required; the config should have caught this.",
        );
    }
    let parsed: JsonObject;
    try {
        parsed = JSON.parse(readFileSync(path, "utf-8")) as JsonObject;
    } catch (cause) {
        throw new Error(
            `Could not read the org-ids artifact at ${path}. The Wave 4 matrix cannot ` +
                `identify the tenants it is supposed to distinguish, so it must fail rather ` +
                `than run against unknown orgs. Cause: ${String(cause)}`,
        );
    }
    if (parsed.schema_version !== "ask_dev_acceptance_org_ids.v1") {
        throw new Error(
            `Unexpected org-ids schema_version ${String(parsed.schema_version)} at ${path}; ` +
                "refusing to guess the field layout.",
        );
    }
    const primaryOrgId = parsed.primary_org_id;
    const secondOrgId = parsed.second_org_id;
    const disabledEntitlementOrgId = parsed.disabled_entitlement_org_id;
    for (const [name, value] of Object.entries({
        primary_org_id: primaryOrgId,
        second_org_id: secondOrgId,
        disabled_entitlement_org_id: disabledEntitlementOrgId,
    })) {
        if (typeof value !== "string" || !value.trim()) {
            throw new Error(`org-ids artifact at ${path} has no usable ${name}.`);
        }
    }
    return {
        primaryOrgId: primaryOrgId as string,
        secondOrgId: secondOrgId as string,
        disabledEntitlementOrgId: disabledEntitlementOrgId as string,
    };
}

/**
 * Cached for the whole file. `/api/v1/auth/login` is rate limited per IP
 * (`AUTH_LOGIN_IP_LIMIT = "20/15minutes"`), and that budget is shared by
 * EVERYTHING the acceptance launcher does from this host: the world-principal
 * login proof, provision_multi_org's org-scoped logins, the Phase 1 spec, and
 * then these rows. Logging in once per test burned four of those for no reason
 * and exhausted the budget mid-suite on the first live run. One login, reused.
 */
let cachedSuperadminToken: string | undefined;

async function superadminToken(request: APIRequestContext): Promise<string> {
    if (cachedSuperadminToken) return cachedSuperadminToken;

    const response = await request.post(`${liveBackendUrl}/api/v1/auth/login`, {
        data: {
            email: process.env.TEST_SUPERUSER_EMAIL,
            password: process.env.TEST_SUPERUSER_PASSWORD,
        },
    });
    const body = await response.text();

    // A 429 is an environment condition, not a credentials problem. The first
    // version of this helper reported both as "the platform admin could not log
    // in", which sent the reader hunting for a bad password when the real cause
    // was an exhausted per-IP login budget. Say which it is.
    if (response.status() === 429) {
        throw new Error(
            "Ask Dev Wave 4 access matrix could not authenticate: the login endpoint returned 429. " +
                "This is the per-IP login budget (AUTH_LOGIN_IP_LIMIT, 20/15minutes) exhausted by " +
                "earlier logins in this acceptance run — NOT bad credentials. Re-run once the window " +
                `clears, or reduce logins before this point. Body: ${body}`,
        );
    }
    if (!response.ok()) {
        throw new Error(
            `Ask Dev Wave 4 access matrix could not authenticate the seeded platform admin: ` +
                `HTTP ${response.status()}. Body: ${body}`,
        );
    }

    const token = (JSON.parse(body) as JsonObject).access_token;
    if (typeof token !== "string" || !token) {
        throw new Error(`Login succeeded but returned no access_token. Body: ${body}`);
    }
    cachedSuperadminToken = token;
    return token;
}

/**
 * Mint a fresh, verified, non-superuser member of `orgId`. Unique per run by
 * uuid, so a re-run can never silently reuse a prior run's user (whose org
 * membership or entitlement may since have changed).
 */
async function mintMember(
    request: APIRequestContext,
    token: string,
    orgId: string,
    label: string,
): Promise<{ email: string; userId: string }> {
    const email = `ask-dev-wave4-${label}-${randomUUID()}@example.com`;
    const created = await request.post(`${liveBackendUrl}/api/v1/admin/users`, {
        data: {
            email,
            full_name: `Ask Dev Wave 4 ${label}`,
            is_superuser: false,
            is_verified: true,
            password: MEMBER_PASSWORD,
        },
        headers: authHeaders(token),
    });
    const body = (await created.json()) as JsonObject;
    expect(created.ok(), `Could not mint the ${label} member: ${JSON.stringify(body)}`).toBe(true);
    const userId = body.id;
    expect(typeof userId, `Minted ${label} member has no id.`).toBe("string");

    const membership = await request.post(`${liveBackendUrl}/api/v1/admin/orgs/${orgId}/members`, {
        data: { role: "member", user_id: userId },
        headers: authHeaders(token),
    });
    expect(
        membership.ok(),
        `Could not add the ${label} member to org ${orgId}: ${await membership.text()}`,
    ).toBe(true);

    return { email, userId: userId as string };
}

/** Sign in through the real Auth.js browser flow and confirm the session took. */
async function signIn(page: Page, email: string, password: string): Promise<void> {
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    const callback = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/auth/callback/credentials" &&
            response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign In" }).click();
    expect((await callback).ok(), `${email} could not sign in.`).toBe(true);
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/u);
}

/** A browser context with no session at all. */
async function anonymousPage(
    browser: Browser,
): Promise<{ page: Page; close: () => Promise<void> }> {
    const context = await browser.newContext({ baseURL: WEB_BASE_URL });
    return { page: await context.newPage(), close: () => context.close() };
}

// ---------------------------------------------------------------------------
// Row B2 — unauthenticated. New coverage.
// ---------------------------------------------------------------------------

test("an unauthenticated visitor is sent to sign-in, with the validation route preserved as the callback", async ({
    browser,
}, testInfo) => {
    const { page, close } = await anonymousPage(browser);
    try {
        await page.goto("/superadmin/context-fabric/validation", {
            waitUntil: "domcontentloaded",
        });

        await expect(page).toHaveURL(/\/auth\/signin/u);
        // The callbackUrl half matters as much as the redirect: without it the
        // guard "works" but silently drops the user's destination after login.
        expect(
            new URL(page.url()).searchParams.get("callbackUrl"),
            "Sign-in did not preserve the validation route as the post-login destination.",
        ).toContain("/superadmin/context-fabric/validation");

        // Absence assertions need a positive control, or a 500 would satisfy them.
        await expect(page.getByLabel("Email")).toBeVisible();
        await expect(page.getByRole("heading", { name: "Context Fabric Validation" })).toHaveCount(
            0,
        );

        await page.screenshot({
            path: testInfo.outputPath("validation-anonymous-redirected.png"),
            fullPage: true,
        });
    } finally {
        await close();
    }
});

// ---------------------------------------------------------------------------
// Rows B1 — old-route compatibility, live.
//
// TIER UPGRADE OF EXISTING UNIT COVERAGE, not new coverage. The branch
// selection is already proven in page.test.tsx; what is NOT proven there is
// that a real request to the old path on a real stack actually redirects,
// because that test mocks requireSession, getOrgEntitlements AND
// permanentRedirect — every moving part of the real path.
// ---------------------------------------------------------------------------

test("TIER UPGRADE: the old context-packet path sends a platform admin to validation, query intact", async ({
    page,
}, testInfo) => {
    await signInCanonicalUser(page);

    await page.goto("/agent-context/context-packet?state=partial", {
        waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(/\/superadmin\/context-fabric\/validation\?state=partial$/u);
    // Prove we LANDED, not merely that the URL changed.
    await expect(
        page.getByRole("heading", { name: "Context Fabric Validation", level: 1 }),
    ).toBeVisible();
    await page.screenshot({
        path: testInfo.outputPath("old-route-superadmin.png"),
        fullPage: true,
    });
});

test("TIER UPGRADE: the old context-packet path sends an entitled member to Ask Dev, without leaking the diagnostic query", async ({
    browser,
    request,
}, testInfo) => {
    const { primaryOrgId } = readProvisionedOrgIds();
    const token = await superadminToken(request);
    const member = await mintMember(request, token, primaryOrgId, "entitled");

    const context = await browser.newContext({ baseURL: WEB_BASE_URL });
    try {
        const page = await context.newPage();
        await signIn(page, member.email, MEMBER_PASSWORD);

        await page.goto("/agent-context/context-packet?state=error&repository=private-repo", {
            waitUntil: "domcontentloaded",
        });

        await expect(page).toHaveURL(/\/dev(?:[?#]|$)/u);
        // The diagnostic query is platform-admin detail; it must not ride along
        // into a product surface.
        expect(page.url(), "The old route leaked its diagnostic query to /dev.").not.toContain(
            "private-repo",
        );
        await expect(page.getByRole("region", { name: "Ask Dev workspace" })).toBeVisible();
        await page.screenshot({
            path: testInfo.outputPath("old-route-entitled-member.png"),
            fullPage: true,
        });
    } finally {
        await context.close();
    }
});

// ---------------------------------------------------------------------------
// Row A4 — cross-tenant entitlement. New coverage.
//
// This is the axis the existing live coverage does NOT reach: it disables
// ask_dev on the PRIMARY org via the emergency switch, which is a different
// mechanism from an org that was never entitled. This row uses the tenant ops
// provisions for exactly this purpose and that nothing has consumed until now.
// ---------------------------------------------------------------------------

test("a member of the never-entitled org is sent to Diagnose and gets no Ask Dev surface at all", async ({
    browser,
    request,
}, testInfo) => {
    const { disabledEntitlementOrgId } = readProvisionedOrgIds();
    const token = await superadminToken(request);
    const member = await mintMember(request, token, disabledEntitlementOrgId, "unentitled");

    const context = await browser.newContext({ baseURL: WEB_BASE_URL });
    try {
        const page = await context.newPage();
        await signIn(page, member.email, MEMBER_PASSWORD);

        // Old route: unentitled members land on Diagnose, never on the
        // platform-admin validator.
        await page.goto("/agent-context/context-packet", { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(/\/diagnose(?:[?#]|$)/u);
        expect(page.url()).not.toContain("context-fabric");

        // Entitlement is an org property, not a route property: the launcher
        // must be absent on an ordinary route too. The same route renders the
        // launcher for an entitled member (ask-dev-shared.spec.ts W9), so this
        // absence is attributable to entitlement rather than to the page.
        await expect(page.getByRole("button", { name: "Open Ask Dev" })).toHaveCount(0);

        // And the full-page workspace refuses by name rather than 404ing.
        await page.goto("/dev", { waitUntil: "domcontentloaded" });
        await expect(
            page.getByText("Ask Dev is not available for this organization"),
        ).toBeVisible();

        await page.screenshot({
            path: testInfo.outputPath("unentitled-org-no-ask-dev.png"),
            fullPage: true,
        });
    } finally {
        await context.close();
    }
});

// ---------------------------------------------------------------------------
// Row A3 — impersonation. RULED INTENDED, CHAOS-3587 (2026-08-07).
//
// A platform admin acting on behalf of a struggling user keeps the validation
// surface, works inside the TARGET org (consuming that org's budget), and
// retains retrieval debug. That is the product's intent, not an accident of
// `requireSuperuser` (src/lib/auth.ts:514) reading only `is_superuser`.
//
// This spec is therefore the PERMANENT pin of the ruled semantics, asserted
// affirmatively rather than merely observed. No deny-guard variant exists or
// will: a future change that closes the surface while impersonating, or that
// silently resolves the admin's OWN org instead of the target's, is a
// REGRESSION against CHAOS-3587 and must fail here.
// ---------------------------------------------------------------------------

test("RULED INTENDED (CHAOS-3587): an impersonating platform admin keeps validation, scoped to the target org", async ({
    page,
    request,
}, testInfo) => {
    const { disabledEntitlementOrgId } = readProvisionedOrgIds();
    const token = await superadminToken(request);
    const target = await mintMember(request, token, disabledEntitlementOrgId, "impersonated");

    await signInCanonicalUser(page);

    // Positive control FIRST: the surface is reachable before impersonation, so
    // any change below is attributable to impersonation and not to a broken
    // session or an unrelated outage.
    await page.goto("/superadmin/context-fabric/validation", { waitUntil: "domcontentloaded" });
    await expect(
        page.getByRole("heading", { name: "Context Fabric Validation", level: 1 }),
    ).toBeVisible();

    const started = await request.post(`${liveBackendUrl}/api/v1/admin/impersonate`, {
        headers: authHeaders(token),
        data: { target_user_id: target.userId },
    });
    expect(started.ok(), `Could not start impersonation: ${await started.text()}`).toBe(true);
    expect((await started.json()) as JsonObject).toMatchObject({ status: "active" });

    try {
        // The web session learns about impersonation through a superuser-only
        // JWT poll memoized for 3s (src/lib/auth.ts:60-64), so poll for the
        // banner rather than assuming the next render already knows.
        await expect
            .poll(
                async () => {
                    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
                    return page.getByText(/Viewing as/u).count();
                },
                {
                    message:
                        "The session never picked up impersonation; the pin below would be vacuous.",
                    timeout: 30_000,
                },
            )
            .toBeGreaterThan(0);

        await page.goto("/superadmin/context-fabric/validation", {
            waitUntil: "domcontentloaded",
        });

        // RULED SEMANTICS (CHAOS-3587), asserted affirmatively.
        //
        // 1. The platform-admin route stays reachable while impersonating.
        await expect(page).toHaveURL(/\/superadmin\/context-fabric\/validation(?:[?#]|$)/u);
        await expect(
            page.getByRole("heading", { name: "Context Fabric Validation", level: 1 }),
        ).toBeVisible();

        // 2. The validator is fully operable there — "reachable but inert"
        //    would satisfy (1) while defeating the point of the ruling.
        await expect(page.getByRole("main").getByTestId("context-packet-form")).toBeVisible();

        // 3. THE EFFECTIVE ORG IS THE TARGET'S, not the admin's. This is the
        //    load-bearing half of the ruling — target-org budget consumption is
        //    explicitly allowed — and it is the half a URL/heading check cannot
        //    see. Read from the real session rather than inferred from the UI.
        const session = (await (await page.request.get("/api/auth/session")).json()) as JsonObject;
        const sessionUser = session.user as JsonObject | undefined;
        expect(sessionUser, "The impersonating session exposed no user.").toBeTruthy();
        expect(sessionUser).toMatchObject({
            is_impersonating: true,
            // Superuser identity survives impersonation — this is WHY the
            // surface stays open, and pinning it makes the mechanism explicit.
            is_superuser: true,
            impersonated_user_id: target.userId,
            // Effective org follows the target; the validator therefore reads
            // the target tenant's context, which the ruling permits.
            org_id: disabledEntitlementOrgId,
        });
        // And the admin's own org is still tracked separately, so "effective"
        // is genuinely distinct from "real" rather than both having collapsed
        // onto the same value (which would make the assertion above vacuous).
        expect(
            sessionUser?.real_org_id,
            "real_org_id collapsed onto the impersonated org; the effective-org assertion above would be vacuous.",
        ).not.toBe(disabledEntitlementOrgId);

        // 4. The impersonation banner stays visible on this surface, so the
        //    operator is always told whose tenant they are pointed at.
        await expect(page.getByText(/Viewing as/u).first()).toBeVisible();

        // NOT ASSERTED, and deliberately so: the third clause of the ruling —
        // retrieval debug remains AVAILABLE. The validation page hardcodes
        // `showRetrievalDebug` (page.tsx:68), but that prop only ever surfaces
        // as `packet.retrieval_debug_summary` text inside a GENERATED packet
        // (ContextPacketExplorer.test.tsx:527-537). Reaching it needs a real
        // ACR-backed generation, and this launcher defaults to acr_armed=0 —
        // so on a normal run there is nothing to assert against. Asserting the
        // prop's presence some other way would be asserting the source, not the
        // behaviour, and an assertion that silently passes when ACR is off is
        // exactly the false coverage this suite exists to avoid.
        //
        // Residual, stated rather than hidden: clauses 1, 2 and 3 of CHAOS-3587
        // are pinned here; the debug-availability clause is unproven at any
        // tier. Closing it needs an ACR-armed run (ASK_DEV_ACCEPTANCE_ACR=1),
        // which no CI workflow currently performs.
        await page.screenshot({
            path: testInfo.outputPath("validation-while-impersonating.png"),
            fullPage: true,
        });
    } finally {
        const stopped = await request.post(`${liveBackendUrl}/api/v1/admin/impersonate/stop`, {
            headers: authHeaders(token),
        });
        expect(stopped.ok(), "Impersonation was left active after the test.").toBe(true);
    }
});
