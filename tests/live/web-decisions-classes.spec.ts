/**
 * CHAOS-13277: integrations.write answers per caller class, legacy vs PDP, on the same stack (flip F11 step 4 gate).
 *
 * Two passes of the web server (ci/run_tests.sh live-e2e-web-decisions-classes): "classes-legacy" (AUTHZ_PLATFORM_UI=shadow,
 * enforce off: the legacy rule decides, the yardstick) and then "classes-enforce" (the same plus AUTHZ_DECISIONS_ENFORCE=on: the
 * PDP decides). The legacy pass creates the users and writes each class's answer to web-decisions-logs/classes-answers.json; the
 * enforce pass sends the SAME request for the same user and asserts the answer is EQUAL.
 *
 * The answer of GET /org/admin/integrations/github-app/install is whether web asked go-api for an install URL (POST
 * /api/v1/admin/integrations/github/install-url, route.ts after the guard): a deny returns before that call. Both an allow and a
 * deny end in ?github_app=error here (go-api cannot mint a GitHub install URL in this stack), so the redirect cannot tell them apart.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
    expect,
    test,
    type APIRequestContext,
    type APIResponse,
    type Browser,
    type Page,
} from "@playwright/test";
import {
    authHeaders,
    expectRegisterAccepted,
    getSuperuserToken,
    liveBackendUrl,
    envFault,
    signInCanonicalUser,
    testEmail,
    userIdByEmail,
} from "./helpers";
import { mark, nextDecision, signInUser, webLogPath } from "./web-decisions.helpers";

const PASSWORD = "TestPass123!";
const INSTALL = "/org/admin/integrations/github-app/install";
const INSTALL_URL_ROUTE = "/api/v1/admin/integrations/github/install-url";

type ClassId = "owner" | "admin" | "member" | "viewer" | "superuser";
interface Answer {
    email: string;
    // true = web asked go-api for an install URL (the guard allowed); false = the guard denied first.
    allowed: boolean;
    // superuser only: the switch-org status the cell saw (the switch is part of the request it repeats).
    switchStatus?: number;
}
interface Answers {
    orgId: string;
    classes: Partial<Record<ClassId, Answer>>;
}

// The legacy value for the classes whose legacy answer is fixed (catalog.ts org.integrations.write: superuser or owner/admin).
const LEGACY_VALUE: Partial<Record<ClassId, boolean>> = {
    owner: true,
    admin: true,
    member: false,
    viewer: false,
};

function answersPath(): string {
    return join(dirname(webLogPath()), "classes-answers.json");
}

function goApiLog(): string {
    const path = process.env.LIVE_E2E_GO_API_LOG;
    if (!path) envFault("LIVE_E2E_GO_API_LOG names the go-api log of the live stack");
    return path ?? "";
}

function installUrlCalls(path: string): number {
    return readFileSync(path, "utf8")
        .split("\n")
        .filter(
            (l) =>
                l.startsWith("{") && l.includes(INSTALL_URL_ROUTE) && l.includes('"method":"POST"'),
        ).length;
}

async function expectSetupAnswer(
    res: APIResponse,
    statuses: readonly number[],
    step: string,
): Promise<void> {
    if (statuses.includes(res.status())) return;
    const body = (await res.text()).slice(0, 2000);
    expect(res.status(), `${step} answered ${res.status()}: ${body}`).toBe(statuses[0]);
}

async function sessionOrgId(page: Page): Promise<string> {
    const res = await page.request.get("/api/auth/session");
    await expectSetupAnswer(res, [200], "reading the session");
    return ((await res.json()) as { user?: { org_id?: string } }).user?.org_id ?? "";
}

// The install request as a user sends it, and its answer read from the go-api log (an allow asks for the install URL; a deny does not).
async function installAnswer(page: Page): Promise<boolean> {
    const log = goApiLog();
    const before = installUrlCalls(log);
    await page.request.get(INSTALL, { maxRedirects: 0 });
    // web answers only after go-api answered, so an allow's access line is written by now or within a moment: look a few times.
    for (let i = 0; i < 20; i++) {
        if (installUrlCalls(log) > before) return true;
        await page.waitForTimeout(250);
    }
    return false;
}

async function newUserPage(browser: Browser, baseURL: string | undefined): Promise<Page> {
    const context = await browser.newContext({ baseURL });
    return context.newPage();
}

async function verifyUser(
    request: APIRequestContext,
    superToken: string,
    userId: string,
    who: string,
): Promise<void> {
    await expectSetupAnswer(
        await request.patch(`${liveBackendUrl}/api/v1/admin/users/${userId}`, {
            headers: authHeaders(superToken),
            data: { is_verified: true },
        }),
        [200],
        `verifying the ${who}`,
    );
}

test.describe("integrations.write per caller class, legacy decides @classes-legacy", () => {
    test("each class's legacy answer is recorded for the enforce pass", async ({
        browser,
        request,
    }, testInfo) => {
        const superToken = (await getSuperuserToken(request)) as string;
        expect(superToken, "the seeded superuser cannot log in").not.toBeNull();
        const baseURL = testInfo.project.use.baseURL;
        const answers: Answers = { orgId: "", classes: {} };

        // owner: a registered user owns its own organization O (the default live backend).
        const ownerEmail = testEmail("classes-owner");
        expectRegisterAccepted(
            await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
                data: { email: ownerEmail, password: PASSWORD, full_name: "Classes Owner" },
                headers: { Origin: liveBackendUrl },
            }),
        );
        const ownerId = await userIdByEmail(request, ownerEmail, superToken);
        expect(ownerId, "the owner is not in the admin user list").not.toBe("");
        await verifyUser(request, superToken, ownerId, "owner");
        const ownerPage = await newUserPage(browser, baseURL);
        await signInUser(ownerPage, ownerEmail, PASSWORD);
        answers.orgId = await sessionOrgId(ownerPage);
        expect(answers.orgId, "the owner has no organization").not.toBe("");
        answers.classes.owner = { email: ownerEmail, allowed: await installAnswer(ownerPage) };

        // admin, member (never an owner), viewer: platform users with no organization, added to O with the role, so O is
        // their only membership and their session organization.
        for (const role of ["admin", "member", "viewer"] as const) {
            const email = testEmail(`classes-${role}`);
            await expectSetupAnswer(
                await request.post(`${liveBackendUrl}/api/v1/admin/users`, {
                    headers: authHeaders(superToken),
                    data: { email, password: PASSWORD, full_name: `Classes ${role}` },
                }),
                [200, 201],
                `creating the ${role}`,
            );
            const userId = await userIdByEmail(request, email, superToken);
            expect(userId, `the ${role} is not in the admin user list`).not.toBe("");
            await verifyUser(request, superToken, userId, role);
            await expectSetupAnswer(
                await request.post(`${liveBackendUrl}/api/v1/admin/orgs/${answers.orgId}/members`, {
                    headers: authHeaders(superToken),
                    data: { user_id: userId, role },
                }),
                [200, 201],
                `adding the ${role} to the organization`,
            );
            const page = await newUserPage(browser, baseURL);
            await signInUser(page, email, PASSWORD);
            expect(await sessionOrgId(page), `the ${role}'s session organization`).toBe(
                answers.orgId,
            );
            answers.classes[role] = { email, allowed: await installAnswer(page) };
        }

        // superuser with no membership row in O: switch the session to O, then the same install request.
        const superPage = await newUserPage(browser, baseURL);
        await signInCanonicalUser(superPage);
        const switched = await superPage.request.post("/api/auth/switch-org", {
            data: { org_id: answers.orgId },
        });
        answers.classes.superuser = {
            email: "the seeded superuser",
            switchStatus: switched.status(),
            allowed: switched.ok() ? await installAnswer(superPage) : false,
        };

        for (const [cls, want] of Object.entries(LEGACY_VALUE) as [ClassId, boolean][]) {
            expect(answers.classes[cls]?.allowed, `legacy: ${cls} integrations.write`).toBe(want);
        }
        writeFileSync(answersPath(), JSON.stringify(answers, null, 2));
    });
});

test.describe("integrations.write per caller class, the PDP decides @classes-enforce", () => {
    test.describe.configure({ mode: "serial" });
    let legacy: Answers;
    test.beforeAll(() => {
        try {
            legacy = JSON.parse(readFileSync(answersPath(), "utf8")) as Answers;
        } catch {
            throw new Error(
                `no legacy answers at ${answersPath()}: the classes-legacy pass must run first`,
            );
        }
        expect(legacy.orgId, "the legacy answers name no organization").not.toBe("");
    });

    for (const cls of ["owner", "admin", "member", "viewer"] as const) {
        test(`${cls}: integrations.write answer equals the legacy answer`, async ({
            browser,
        }, testInfo) => {
            const want = legacy.classes[cls];
            expect(want, `no legacy answer for ${cls}`).toBeDefined();
            const page = await newUserPage(browser, testInfo.project.use.baseURL);
            await signInUser(page, (want as Answer).email, PASSWORD);
            expect(await sessionOrgId(page), `the ${cls}'s session organization`).toBe(
                legacy.orgId,
            );
            const log = webLogPath();
            const since = mark(log);
            const allowed = await installAnswer(page);
            const line = await nextDecision(log, since, "org.integrations.write");
            expect(line.action).toBe("integrations.write");
            expect(line.source, `${cls}: not decided by the PDP`).toBe("pdp");
            expect(line.allowed, `${cls}: the decision line and the request disagree`).toBe(
                allowed,
            );
            expect(
                allowed,
                `${cls}: PDP answer ${allowed}, legacy answer ${(want as Answer).allowed}`,
            ).toBe((want as Answer).allowed);
            expect(allowed, `${cls}: the legacy value`).toBe(LEGACY_VALUE[cls]);
        });
    }

    test("superuser with no membership row: integrations.write answer equals the legacy answer", async ({
        browser,
    }, testInfo) => {
        const want = legacy.classes.superuser as Answer;
        expect(want, "no legacy answer for the superuser").toBeDefined();
        const page = await newUserPage(browser, testInfo.project.use.baseURL);
        await signInCanonicalUser(page);
        const switched = await page.request.post("/api/auth/switch-org", {
            data: { org_id: legacy.orgId },
        });
        expect(switched.status(), "the switch-org answer differs from the legacy pass").toBe(
            want.switchStatus,
        );
        const log = webLogPath();
        const since = mark(log);
        const allowed = switched.ok() ? await installAnswer(page) : false;
        if (switched.ok()) {
            const line = await nextDecision(log, since, "org.integrations.write");
            expect(line.source, "superuser: not decided by the PDP").toBe("pdp");
            expect(line.allowed, "superuser: the decision line and the request disagree").toBe(
                allowed,
            );
        }
        expect(allowed, `superuser: PDP answer ${allowed}, legacy answer ${want.allowed}`).toBe(
            want.allowed,
        );
    });
});
