/**
 * Live decisions of the web server (flip F11). The Next server runs next to the real go-api, the real auth-service (the PDP) and
 * the ops live e2e auth stack. The enforced actions are admin.orgs, admin.users and integrations.write; the verdict of each
 * request is read from the decision line the server logs (the page answer alone cannot tell a PDP deny from a backend refusal).
 *
 * Two passes (playwright.live.config.ts, LIVE_WEB_DECISIONS): "enforce" (AUTHZ_DECISIONS_ENFORCE=on, the PDP decides) and
 * "shadow" (enforcement off, the legacy rules decide and the PDP verdict is only logged).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
    authHeaders,
    expectRegisterAccepted,
    getSuperuserToken,
    liveBackendUrl,
    loginUser,
    signInCanonicalUser,
    testEmail,
    userIdByEmail,
    verifyUser,
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

// A registered, verified user. Registration creates the user's own organization (the default live backend), so the user is its owner.
async function registerOwner(
    request: import("@playwright/test").APIRequestContext,
    superToken: string,
): Promise<{ email: string; userId: string; orgId: string }> {
    const email = testEmail("web-decisions");
    const res = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
        data: { email, password: PASSWORD, full_name: "Decisions Owner" },
        headers: { Origin: liveBackendUrl },
    });
    expectRegisterAccepted(res);
    const userId = await userIdByEmail(request, email, superToken);
    expect(userId, "the registered user is not in the admin user list").not.toBe("");
    expect(await verifyUser(request, userId, superToken), "the user could not be verified").toBe(
        true,
    );
    const login = await loginUser(request, email, PASSWORD);
    const orgId = String((login.user as { org_id?: string } | undefined)?.org_id ?? "");
    expect(orgId, "the owner has no organization").not.toBe("");
    return { email, userId, orgId };
}

test.describe("web decisions: enforced by the PDP @enforce", () => {
    test.describe.configure({ mode: "serial" });

    // First cell of the pass: the server must hold no workload token yet, because it keeps serving a cached token
    // when a later exchange fails. A token cached before this cell makes it fail (source pdp), never pass.
    test("wrong subject: an unknown or expired subject token allows nothing, and it recovers", async ({
        page,
    }) => {
        const log = webLogPath();
        const file = workloadSubjectFile();
        const good = readFileSync(file);
        await signInCanonicalUser(page);
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

    test("superuser: admin.users and admin.orgs are allowed by the PDP", async ({ page }) => {
        const log = webLogPath();
        await signInCanonicalUser(page);
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

        let since = mark(log);
        await page.request.get("/org/admin/integrations/github-app/install", { maxRedirects: 0 });
        const allowed = await nextDecision(log, since, "org.integrations.write");
        expect(allowed.action).toBe("integrations.write");
        expect(allowed.source).toBe("pdp");
        expect(allowed.allowed, `owner refused: ${allowed.reason_code}`).toBe(true);

        const demote = await request.patch(
            `${liveBackendUrl}/api/v1/admin/orgs/${owner.orgId}/members/${owner.userId}`,
            { headers: authHeaders(superToken as string), data: { role: "member" } },
        );
        expect(demote.ok(), `the role change answered ${demote.status()}`).toBe(true);

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

    test("fail-closed: with auth-service stopped nothing is allowed, and it recovers", async ({
        page,
    }) => {
        const log = webLogPath();
        await signInCanonicalUser(page);
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
