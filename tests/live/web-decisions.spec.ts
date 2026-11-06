/**
 * Live decisions of the web server (flip F11). The Next server runs next to the real go-api, the real auth-service (the PDP) and
 * the ops live e2e auth stack. The enforced actions are admin.orgs, admin.users and integrations.write; the verdict of each
 * request is read from the decision line the server logs (the page answer alone cannot tell a PDP deny from a backend refusal).
 *
 * Two passes (playwright.live.config.ts, LIVE_WEB_DECISIONS): "enforce" (AUTHZ_DECISIONS_ENFORCE=on, the PDP decides) and
 * "shadow" (enforcement off, the legacy rules decide and the PDP verdict is only logged).
 */
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
    mark,
    nextDecision,
    shadowRuns,
    signInUser,
    stack,
    webLogPath,
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

    test("superuser: admin.users and admin.orgs are allowed by the PDP", async ({ page }) => {
        const log = webLogPath();
        await signInCanonicalUser(page);
        for (const [path, guard] of [
            ["/superadmin/users", "platform.users"],
            ["/superadmin/orgs", "platform.orgs"],
        ] as const) {
            const since = mark(log);
            const response = await page.goto(path);
            expect(response?.status()).toBe(200);
            const line = await nextDecision(log, since, guard);
            expect(line.source, `${guard} was not decided by the PDP`).toBe("pdp");
            expect(line.allowed, `${guard} was refused: ${line.reason_code}`).toBe(true);
        }
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
            await page.goto("/superadmin/users");
            const line = await nextDecision(log, since, "platform.users");
            expect(line.allowed, "a decision was allowed while the PDP was down").toBe(false);
            expect(line.source, "the deny did not come from the client's fail-closed path").toBe(
                "client",
            );
        } finally {
            stack("start-auth");
        }
        const since = mark(log);
        await page.goto("/superadmin/users");
        const line = await nextDecision(log, since, "platform.users");
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
