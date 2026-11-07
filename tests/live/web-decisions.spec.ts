/**
 * Live decisions of the web server (flip F11). The Next server runs next to the real go-api, the real auth-service (the PDP) and
 * the ops live e2e auth stack. The enforced actions are admin.orgs, admin.users and integrations.write; the verdict of each
 * request is read from the decision line the server logs (the page answer alone cannot tell a PDP deny from a backend refusal).
 *
 * Two passes (playwright.live.config.ts, LIVE_WEB_DECISIONS): "enforce" (AUTHZ_DECISIONS_ENFORCE=on, the PDP decides) and
 * "shadow" (enforcement off, the legacy rules decide and the PDP verdict is only logged).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
    authHeaders,
    expectRegisterAccepted,
    getSuperuserToken,
    liveBackendUrl,
    signInCanonicalUser,
    testEmail,
    userIdByEmail,
} from "./helpers";
import {
    decideLines,
    foreignSubjectJws,
    mark,
    nextDecision,
    sha256Hex,
    shadowRuns,
    signInUser,
    stack,
    webLogPath,
    workloadSubjectFile,
} from "./web-decisions.helpers";

const PASSWORD = "TestPass123!";

// A setup call must answer one of the expected statuses; the failure names the step and carries the answer body.
async function expectSetupAnswer(
    res: import("@playwright/test").APIResponse,
    statuses: readonly number[],
    step: string,
): Promise<void> {
    if (statuses.includes(res.status())) return;
    const body = (await res.text()).slice(0, 2000);
    expect(res.status(), `${step} answered ${res.status()}: ${body}`).toBe(statuses[0]);
}

// A registered, verified user. Registration creates the user's own organization (the default live backend), so the user is its
// owner. No login here: logins share the per-address limit with the rest of the job.
async function registerOwner(
    request: import("@playwright/test").APIRequestContext,
    superToken: string,
): Promise<{ email: string; userId: string }> {
    const email = testEmail("web-decisions");
    const res = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
        data: { email, password: PASSWORD, full_name: "Decisions Owner" },
        headers: { Origin: liveBackendUrl },
    });
    expectRegisterAccepted(res);
    const userId = await userIdByEmail(request, email, superToken);
    expect(userId, "the registered user is not in the admin user list").not.toBe("");
    await expectSetupAnswer(
        await request.patch(`${liveBackendUrl}/api/v1/admin/users/${userId}`, {
            headers: authHeaders(superToken),
            data: { is_verified: true },
        }),
        [200],
        "verifying the user",
    );
    return { email, userId };
}

// The organization of the signed-in user, from its Auth.js session.
async function sessionOrgId(page: Page): Promise<string> {
    const res = await page.request.get("/api/auth/session");
    await expectSetupAnswer(res, [200], "reading the session");
    const body = (await res.json()) as { user?: { org_id?: string } };
    const orgId = body.user?.org_id ?? "";
    expect(orgId, "the signed-in owner has no organization").not.toBe("");
    return orgId;
}

test.describe("web decisions: enforced by the PDP @enforce", () => {
    test.describe.configure({ mode: "serial" });

    // One superuser sign-in for the pass: the cells below share it, so the pass spends one login on that account.
    let superContext: BrowserContext;
    let superPage: Page;
    test.beforeAll(async ({ browser }, testInfo) => {
        superContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
        superPage = await superContext.newPage();
        await signInCanonicalUser(superPage);
    });
    test.afterAll(async () => {
        await superContext?.close();
    });

    // First cell of the pass: the server must hold no workload token yet, because it keeps serving a cached token
    // when a later exchange fails. A token cached before this cell makes it fail (source pdp), never pass.
    test("wrong subject: an unknown or expired subject token allows nothing, and it recovers", async () => {
        const page = superPage;
        const log = webLogPath();
        const file = workloadSubjectFile();
        const good = readFileSync(file);
        try {
            for (const [label, subject] of [
                ["a subject the TokenReview does not know", foreignSubjectJws(3600)],
                ["an expired subject", foreignSubjectJws(-3600)],
            ] as const) {
                writeFileSync(file, subject);
                const since = mark(log);
                await page.goto("/superadmin/orgs");
                const line = await nextDecision(log, since, "platform.orgs");
                expect(line.action).toBe("admin.orgs");
                expect(line.allowed, `${label} was allowed`).toBe(false);
                expect(
                    line.source,
                    `${label}: the deny did not come from the client's fail-closed path`,
                ).toBe("client");
            }
        } finally {
            writeFileSync(file, good);
        }
        expect(sha256Hex(readFileSync(file)), "the subject file was not restored").toBe(
            sha256Hex(good),
        );
        const since = mark(log);
        await page.goto("/superadmin/orgs");
        const line = await nextDecision(log, since, "platform.orgs");
        expect(line.action).toBe("admin.orgs");
        expect(line.source).toBe("pdp");
        expect(line.allowed, `not allowed after the subject came back: ${line.reason_code}`).toBe(
            true,
        );
    });

    test("superuser: admin.users and admin.orgs are allowed by the PDP", async () => {
        const page = superPage;
        const log = webLogPath();
        // The org list page decides admin.orgs (listOrganizations).
        let since = mark(log);
        const response = await page.goto("/superadmin/orgs");
        expect(response?.status()).toBe(200);
        const orgs = await nextDecision(log, since, "platform.orgs");
        expect(orgs.action).toBe("admin.orgs");
        expect(orgs.source, "admin.orgs was not decided by the PDP").toBe("pdp");
        expect(orgs.allowed, `admin.orgs was refused: ${orgs.reason_code}`).toBe(true);

        // The user list makes no decision; creating a platform user decides admin.users (createPlatformUser).
        await page.goto("/superadmin/users/new");
        await page.getByLabel(/email/i).fill(testEmail("web-decisions-platform-user"));
        await page.getByLabel(/^password/i).fill(PASSWORD);
        since = mark(log);
        await page.getByRole("button", { name: "Add User", exact: true }).click();
        const users = await nextDecision(log, since, "platform.users");
        expect(users.action).toBe("admin.users");
        expect(users.source, "admin.users was not decided by the PDP").toBe("pdp");
        expect(users.allowed, `admin.users was refused: ${users.reason_code}`).toBe(true);
    });

    test("org owner: integrations.write is allowed, then denied once the role is a member", async ({
        page,
        request,
    }) => {
        const log = webLogPath();
        const superToken = await getSuperuserToken(request);
        expect(superToken, "the seeded superuser cannot log in").not.toBeNull();
        const owner = await registerOwner(request, superToken as string);
        await signInUser(page, owner.email, PASSWORD);
        const orgId = await sessionOrgId(page);

        let since = mark(log);
        await page.request.get("/org/admin/integrations/github-app/install", { maxRedirects: 0 });
        const allowed = await nextDecision(log, since, "org.integrations.write");
        expect(allowed.action).toBe("integrations.write");
        expect(allowed.source).toBe("pdp");
        expect(allowed.allowed, `owner refused: ${allowed.reason_code}`).toBe(true);

        // The backend refuses to demote the last owner of an organization: a second owner comes first.
        const second = await registerOwner(request, superToken as string);
        await expectSetupAnswer(
            await request.post(`${liveBackendUrl}/api/v1/admin/orgs/${orgId}/members`, {
                headers: authHeaders(superToken as string),
                data: { user_id: second.userId, role: "owner" },
            }),
            [200, 201],
            "adding a second owner",
        );
        await expectSetupAnswer(
            await request.patch(
                `${liveBackendUrl}/api/v1/admin/orgs/${orgId}/members/${owner.userId}`,
                { headers: authHeaders(superToken as string), data: { role: "owner" } },
            ),
            [200],
            "the role change to member",
        );

        since = mark(log);
        const denied = await page.request.get("/org/admin/integrations/github-app/install", {
            maxRedirects: 0,
        });
        const line = await nextDecision(log, since, "org.integrations.write");
        expect(line.action).toBe("integrations.write");
        expect(line.source, "the deny did not come from the PDP").toBe("pdp");
        expect(line.allowed, "a member was allowed to write integrations").toBe(false);
        expect(denied.headers().location ?? "").toContain("github_app=error");
    });

    test("fail-closed: with auth-service stopped nothing is allowed, and it recovers", async () => {
        const page = superPage;
        const log = webLogPath();
        stack("stop-auth");
        try {
            const since = mark(log);
            await page.goto("/superadmin/orgs");
            const line = await nextDecision(log, since, "platform.orgs");
            expect(line.action).toBe("admin.orgs");
            expect(line.allowed, "a decision was allowed while the PDP was down").toBe(false);
            expect(line.source, "the deny did not come from the client's fail-closed path").toBe(
                "client",
            );
        } finally {
            stack("start-auth");
        }
        const since = mark(log);
        await page.goto("/superadmin/orgs");
        const line = await nextDecision(log, since, "platform.orgs");
        expect(line.action).toBe("admin.orgs");
        expect(line.source).toBe("pdp");
        expect(line.allowed, `not allowed after auth-service came back: ${line.reason_code}`).toBe(
            true,
        );
    });
});

test.describe("web decisions: shadow mode @shadow", () => {
    test("legacy rules decide, no enforced decision is logged, the shadow run is logged", async ({
        page,
    }) => {
        const log = webLogPath();
        await signInCanonicalUser(page);
        const before = shadowRuns(log);
        const decided = decideLines(log);
        const response = await page.goto("/superadmin/users");
        expect(response?.status()).toBe(200);
        await expect(page.getByText("Error loading users", { exact: false })).toHaveCount(0);
        await expect.poll(() => shadowRuns(log), { timeout: 30_000 }).toBeGreaterThan(before);
        expect(decideLines(log), "enforcement is off: decideGuard must not call the PDP").toBe(
            decided,
        );
    });
});
