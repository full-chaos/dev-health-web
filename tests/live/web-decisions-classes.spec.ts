/**
 * CHAOS-13277: integrations.write answers per caller class, legacy vs PDP, on the same stack (flip F11 step 4 gate).
 *
 * Two passes of the web server (ci/run_tests.sh live-e2e-web-decisions-classes): "classes-legacy" (AUTHZ_PLATFORM_UI=shadow,
 * enforce off: the legacy rule decides, the yardstick) and then "classes-enforce" (the same plus AUTHZ_DECISIONS_ENFORCE=on: the
 * PDP decides). The legacy pass creates the users and writes each class's answer to web-decisions-logs/classes-answers.json; the
 * enforce pass sends the SAME request for the same user and asserts the answer is EQUAL.
 *
 * CHAOS-13290 adds a third pass, "classes-rollback" (AUTHZ_PLATFORM_UI=shadow, enforce off again: the step 4 rollback on the same
 * stack): every class's answer equals the legacy answer and the decision client is not called for the enforced actions. It also
 * adds two multi-org classes, integrations.write only, both with session organization B: a user who is admin in O and member in B
 * (legacy deny), and a user who is admin in B (legacy allow).
 *
 * The answer of GET /org/admin/integrations/github-app/install is whether web asked go-api for an install URL (POST
 * /api/v1/admin/integrations/github/install-url, route.ts after the guard): a deny returns before that call. Both an allow and a
 * deny end in ?github_app=error here (go-api cannot mint a GitHub install URL in this stack), so the redirect cannot tell them apart.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
    superuserEmail,
    superuserPassword,
    testEmail,
    userIdByEmail,
} from "./helpers";
import {
    decisionClientLines,
    mark,
    nextDecision,
    pdpDecideLines,
    shadowRunsOf,
    signInUser,
    webLogPath,
} from "./web-decisions.helpers";

const PASSWORD = "TestPass123!";
// A refused login (429 or any other) fails the cell at its sign-in or token step; it is never recorded as an answer.
const INSTALL = "/org/admin/integrations/github-app/install";
const INSTALL_URL_ROUTE = "/api/v1/admin/integrations/github/install-url";

type ClassId = "owner" | "admin" | "member" | "viewer" | "superuser";
// The multi-org classes: session organization B. adminOMemberB = admin in O and member in B; adminB = admin in B, no other row.
type MultiClassId = "adminOMemberB" | "adminB";
interface Answer {
    email: string;
    // 1 = web asked go-api for an install URL (the guard allowed); 0 = the guard denied first.
    calls: number;
}
interface Answers {
    orgId: string;
    orgB?: string;
    classes: Partial<Record<ClassId | MultiClassId, Answer>>;
}

// The legacy value for the classes whose legacy answer is fixed (catalog.ts org.integrations.write: superuser or owner/admin).
const LEGACY_VALUE: Partial<Record<ClassId, boolean>> = {
    owner: true,
    admin: true,
    member: false,
    viewer: false,
};
// The same rule for the multi-org classes, judged on the session organization B only: the admin row in O gives nothing in B.
const MULTI_LEGACY_VALUE: Record<MultiClassId, boolean> = {
    adminOMemberB: false,
    adminB: true,
};
const MULTI_CLASSES = ["adminOMemberB", "adminB"] as const;
// The actions web decides with the PDP when enforce is on (the guards of the F11 decision client).
const ENFORCED = [
    "admin.orgs",
    "admin.users",
    "integrations.write",
    "platform.orgs",
    "platform.users",
    "org.integrations.write",
] as const;

function answersPath(): string {
    return join(dirname(webLogPath()), "classes-answers.json");
}

// The go-api log is the counter of the answer: a missing or unreadable log fails the cell (never an answer of 0).
function goApiLog(): string {
    const path = process.env.LIVE_E2E_GO_API_LOG;
    if (!path || !existsSync(path)) {
        throw new Error(
            `LIVE_E2E_GO_API_LOG must name the readable go-api log of the live stack (got ${String(path)})`,
        );
    }
    return path;
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

// The install request as a user sends it, and its answer read from the go-api log: the exact number of install-url requests
// from a mark, 0 (the guard denied first) or 1 (the guard allowed). Anything else fails the cell.
async function installCalls(page: Page): Promise<number> {
    const log = goApiLog();
    const before = installUrlCalls(log);
    await page.request.get(INSTALL, { maxRedirects: 0 });
    // web answers only after go-api answered, so an allow's access line is written by now or within a moment: look a few times.
    for (let i = 0; i < 20 && installUrlCalls(log) === before; i++) await page.waitForTimeout(250);
    const calls = installUrlCalls(log) - before;
    expect([0, 1], `install-url requests for one install request: ${calls}`).toContain(calls);
    return calls;
}

// AUTHZ_PLATFORM_UI=shadow is live in this pass (observed, not read from config): a platform page load writes a platform shadow run.
async function expectPlatformShadow(page: Page): Promise<void> {
    const log = webLogPath();
    const surfaces = ["page:/superadmin/orgs", "fn:listOrganizations"];
    const before = shadowRunsOf(log, surfaces);
    expect((await page.goto("/superadmin/orgs"))?.status()).toBe(200);
    await expect
        .poll(() => shadowRunsOf(log, surfaces), {
            message: "no platform shadow run: AUTHZ_PLATFORM_UI=shadow is not live in this pass",
            timeout: 30_000,
        })
        .toBeGreaterThan(before);
}

// The login form sends no org_id: the user signs in with the named organization through the credentials callback itself.
async function signInWithOrg(
    page: Page,
    email: string,
    password: string,
    orgId: string,
    who: string,
): Promise<void> {
    const csrf = await page.request.get("/api/auth/csrf");
    await expectSetupAnswer(csrf, [200], "reading the CSRF token");
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    await expectSetupAnswer(
        await page.request.post("/api/auth/callback/credentials", {
            form: {
                csrfToken,
                email,
                password,
                org_id: orgId,
                callbackUrl: "/dashboard",
            },
            maxRedirects: 0,
        }),
        [302, 303, 200],
        `the ${who} sign-in with the organization`,
    );
    const session = await page.request.get("/api/auth/session");
    await expectSetupAnswer(session, [200], `reading the ${who} session`);
    const user = ((await session.json()) as { user?: { email?: string; org_id?: string } }).user;
    expect(user?.email, `the ${who} sign-in with the organization made no session`).toBe(email);
    expect(user?.org_id, `${who}: the session organization after the sign-in`).toBe(orgId);
}

async function signInSuperuserWithOrg(page: Page, orgId: string): Promise<void> {
    await signInWithOrg(page, superuserEmail, superuserPassword, orgId, "superuser");
}

async function superuserRowsIn(
    request: APIRequestContext,
    superToken: string,
    orgId: string,
    superId: string,
): Promise<number> {
    const res = await request.get(`${liveBackendUrl}/api/v1/admin/orgs/${orgId}/members`, {
        headers: authHeaders(superToken),
    });
    await expectSetupAnswer(res, [200], "listing the members of O");
    return ((await res.json()) as Array<{ user_id?: string }>).filter((m) => m.user_id === superId)
        .length;
}

// The superuser with no membership row in O and a session in O: a member row is added, the superuser signs in with org O, the
// row is removed through go-api, and the session stays. A session that is not in O, or a row left in O, fails the cell.
async function superuserSessionWithoutRow(
    page: Page,
    request: APIRequestContext,
    superToken: string,
    orgId: string,
): Promise<void> {
    const superId = await userIdByEmail(request, superuserEmail, superToken);
    expect(superId, "the superuser is not in the admin user list").not.toBe("");
    await expectSetupAnswer(
        await request.post(`${liveBackendUrl}/api/v1/admin/orgs/${orgId}/members`, {
            headers: authHeaders(superToken),
            data: { user_id: superId, role: "member" },
        }),
        [200, 201],
        "adding the superuser to O as member",
    );
    await signInSuperuserWithOrg(page, orgId);
    await expectSetupAnswer(
        await request.delete(`${liveBackendUrl}/api/v1/admin/orgs/${orgId}/members/${superId}`, {
            headers: authHeaders(superToken),
        }),
        [200],
        "removing the superuser's row in O through go-api",
    );
    expect(
        await sessionOrgId(page),
        "superuser: the session organization after the row removal",
    ).toBe(orgId);
    expect(
        await superuserRowsIn(request, superToken, orgId, superId),
        "superuser: membership rows in O before the install request",
    ).toBe(0);
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

// A verified platform user with no organization (the admin API), for the multi-org classes.
async function createVerifiedUser(
    request: APIRequestContext,
    superToken: string,
    email: string,
    who: string,
): Promise<string> {
    await expectSetupAnswer(
        await request.post(`${liveBackendUrl}/api/v1/admin/users`, {
            headers: authHeaders(superToken),
            data: { email, password: PASSWORD, full_name: `Classes ${who}` },
        }),
        [200, 201],
        `creating the ${who}`,
    );
    const userId = await userIdByEmail(request, email, superToken);
    expect(userId, `the ${who} is not in the admin user list`).not.toBe("");
    await verifyUser(request, superToken, userId, who);
    return userId;
}

async function addMember(
    request: APIRequestContext,
    superToken: string,
    orgId: string,
    userId: string,
    role: "admin" | "member",
    step: string,
): Promise<void> {
    await expectSetupAnswer(
        await request.post(`${liveBackendUrl}/api/v1/admin/orgs/${orgId}/members`, {
            headers: authHeaders(superToken),
            data: { user_id: userId, role },
        }),
        [200, 201],
        step,
    );
}

// Organization B, created by the superuser with no owner row: only the rows the cells add exist in B.
async function createOrgB(request: APIRequestContext, superToken: string): Promise<string> {
    const res = await request.post(`${liveBackendUrl}/api/v1/admin/orgs`, {
        headers: authHeaders(superToken),
        data: { name: `Classes B ${Date.now()}` },
    });
    await expectSetupAnswer(res, [201, 200], "creating organization B");
    const id = ((await res.json()) as { id?: string }).id ?? "";
    expect(id, "organization B has no id").not.toBe("");
    return id;
}

// The multi-org user's install request in its session organization B: a fresh sign-in with org B each pass.
async function multiOrgCalls(
    browser: Browser,
    baseURL: string | undefined,
    email: string,
    orgB: string,
    cls: MultiClassId,
): Promise<number> {
    const page = await newUserPage(browser, baseURL);
    await signInWithOrg(page, email, PASSWORD, orgB, cls);
    expect(await sessionOrgId(page), `${cls}: the session organization`).toBe(orgB);
    return installCalls(page);
}

function readLegacyAnswers(): Answers {
    let legacy: Answers;
    try {
        legacy = JSON.parse(readFileSync(answersPath(), "utf8")) as Answers;
    } catch {
        throw new Error(
            `no legacy answers at ${answersPath()}: the classes-legacy pass must run first`,
        );
    }
    expect(legacy.orgId, "the legacy answers name no organization").not.toBe("");
    return legacy;
}

// One superuser API login per pass for the legacy tests: the per-address-and-account login limit counts every login of the job.
let legacySuperToken: string | null = null;
async function legacySuperuserToken(request: APIRequestContext): Promise<string> {
    legacySuperToken ??= await getSuperuserToken(request);
    expect(legacySuperToken, "the seeded superuser cannot log in").not.toBeNull();
    return legacySuperToken as string;
}

test.describe("integrations.write per caller class, legacy decides @classes-legacy", () => {
    test("each class's legacy answer is recorded for the enforce pass", async ({
        browser,
        request,
    }, testInfo) => {
        const superToken = await legacySuperuserToken(request);
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
        answers.classes.owner = { email: ownerEmail, calls: await installCalls(ownerPage) };

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
            answers.classes[role] = { email, calls: await installCalls(page) };
        }

        // superuser with no membership row in O, session in O: the executed legacy answer is the yardstick (no pinned value).
        const superPage = await newUserPage(browser, baseURL);
        await superuserSessionWithoutRow(superPage, request, superToken, answers.orgId);
        await expectPlatformShadow(superPage);
        expect(await sessionOrgId(superPage), "superuser: the session organization").toBe(
            answers.orgId,
        );
        answers.classes.superuser = { email: superuserEmail, calls: await installCalls(superPage) };
        testInfo.annotations.push({
            type: "report",
            description: `legacy: superuser with no row in O, session in O: install-url requests ${answers.classes.superuser.calls}`,
        });
        writeFileSync(answersPath(), JSON.stringify(answers, null, 2));

        // The legacy pass: the legacy values, the counter self-check (owner and admin read 1), and no PDP verdict at all.
        for (const [cls, want] of Object.entries(LEGACY_VALUE) as [ClassId, boolean][]) {
            expect(
                answers.classes[cls]?.calls,
                `legacy: ${cls} integrations.write install-url requests`,
            ).toBe(want ? 1 : 0);
        }
        expect(pdpDecideLines(webLogPath()), "the legacy pass logged a PDP verdict").toBe(0);
    });

    test("multi-org: each class's legacy answer in organization B is recorded", async ({
        browser,
        request,
    }, testInfo) => {
        const answers = readLegacyAnswers();
        const superToken = await legacySuperuserToken(request);
        const baseURL = testInfo.project.use.baseURL;
        const orgB = await createOrgB(request, superToken);
        expect(orgB, "organization B is organization O").not.toBe(answers.orgId);
        answers.orgB = orgB;

        // adminOMemberB: admin in O and member in B, session in B.
        const adminOMemberB = testEmail("classes-admin-o-member-b");
        const u1 = await createVerifiedUser(request, superToken, adminOMemberB, "adminOMemberB");
        await addMember(
            request,
            superToken,
            answers.orgId,
            u1,
            "admin",
            "adding adminOMemberB to O as admin",
        );
        await addMember(
            request,
            superToken,
            orgB,
            u1,
            "member",
            "adding adminOMemberB to B as member",
        );
        // adminB: admin in B, no other row.
        const adminB = testEmail("classes-admin-b");
        const u2 = await createVerifiedUser(request, superToken, adminB, "adminB");
        await addMember(request, superToken, orgB, u2, "admin", "adding adminB to B as admin");

        for (const [cls, email] of [
            ["adminOMemberB", adminOMemberB],
            ["adminB", adminB],
        ] as const) {
            answers.classes[cls] = {
                email,
                calls: await multiOrgCalls(browser, baseURL, email, orgB, cls),
            };
        }
        writeFileSync(answersPath(), JSON.stringify(answers, null, 2));

        for (const cls of MULTI_CLASSES) {
            expect(
                answers.classes[cls]?.calls,
                `legacy: ${cls} integrations.write install-url requests in organization B`,
            ).toBe(MULTI_LEGACY_VALUE[cls] ? 1 : 0);
        }
        expect(pdpDecideLines(webLogPath()), "the legacy pass logged a PDP verdict").toBe(0);
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
            const want = legacy.classes[cls] as Answer;
            expect(want, `no legacy answer for ${cls}`).toBeDefined();
            const page = await newUserPage(browser, testInfo.project.use.baseURL);
            await signInUser(page, want.email, PASSWORD);
            expect(await sessionOrgId(page), `the ${cls}'s session organization`).toBe(
                legacy.orgId,
            );
            const log = webLogPath();
            const since = mark(log);
            const calls = await installCalls(page);
            const line = await nextDecision(log, since, "org.integrations.write");
            expect(line.action).toBe("integrations.write");
            expect(line.source, `${cls}: not decided by the PDP`).toBe("pdp");
            expect(line.allowed, `${cls}: the decision line and the request disagree`).toBe(
                calls === 1,
            );
            // The yardstick: the same request gave this answer with legacy deciding (any difference is a parity defect: STOP).
            expect(calls, `${cls}: PDP answer ${calls}, legacy answer ${want.calls}`).toBe(
                want.calls,
            );
            // Counter self-check: owner and admin read 1 in this pass too.
            expect(calls, `${cls}: the legacy value`).toBe(LEGACY_VALUE[cls] ? 1 : 0);
        });
    }

    test("superuser with no membership row: integrations.write answer equals the legacy answer", async ({
        browser,
        request,
    }, testInfo) => {
        const want = legacy.classes.superuser as Answer;
        expect(want, "no legacy answer for the superuser").toBeDefined();
        const superToken = (await getSuperuserToken(request)) as string;
        expect(superToken, "the seeded superuser cannot log in").not.toBeNull();
        const page = await newUserPage(browser, testInfo.project.use.baseURL);
        await superuserSessionWithoutRow(page, request, superToken, legacy.orgId);
        await expectPlatformShadow(page);
        expect(await sessionOrgId(page), "superuser: the session organization").toBe(legacy.orgId);
        const log = webLogPath();
        const since = mark(log);
        const calls = await installCalls(page);
        const line = await nextDecision(log, since, "org.integrations.write");
        expect(line.source, "superuser: not decided by the PDP").toBe("pdp");
        expect(line.allowed, "superuser: the decision line and the request disagree").toBe(
            calls === 1,
        );
        expect(calls, `superuser: PDP answer ${calls}, legacy answer ${want.calls}`).toBe(
            want.calls,
        );
        expect([0, 1], `superuser: the recorded legacy value is ${want.calls}, not 0|1`).toContain(
            want.calls,
        );
        testInfo.annotations.push({
            type: "report",
            description: `superuser with no row in O, session in O: PDP install-url requests ${calls}, recorded legacy ${want.calls}`,
        });
    });

    for (const cls of MULTI_CLASSES) {
        test(`multi-org ${cls}: integrations.write answer in organization B equals the legacy answer`, async ({
            browser,
        }, testInfo) => {
            const want = legacy.classes[cls] as Answer;
            expect(want, `no legacy answer for ${cls}`).toBeDefined();
            expect(legacy.orgB, "the legacy answers name no organization B").toBeTruthy();
            const log = webLogPath();
            const since = mark(log);
            const calls = await multiOrgCalls(
                browser,
                testInfo.project.use.baseURL,
                want.email,
                legacy.orgB as string,
                cls,
            );
            const line = await nextDecision(log, since, "org.integrations.write");
            expect(line.action).toBe("integrations.write");
            expect(line.source, `${cls}: not decided by the PDP`).toBe("pdp");
            expect(line.allowed, `${cls}: the decision line and the request disagree`).toBe(
                calls === 1,
            );
            expect(calls, `${cls}: PDP answer ${calls}, legacy answer ${want.calls}`).toBe(
                want.calls,
            );
            expect(calls, `${cls}: the legacy value`).toBe(MULTI_LEGACY_VALUE[cls] ? 1 : 0);
        });
    }
});

test.describe("integrations.write per caller class, enforce switched off again (rollback) @classes-rollback", () => {
    test.describe.configure({ mode: "serial" });
    let legacy: Answers;
    test.beforeAll(() => {
        legacy = readLegacyAnswers();
    });

    // After the switch-off the answer is the legacy answer and the decision client is not asked: no authz_decide line from the
    // PDP or the client (a deny) for the install guard after the request.
    async function expectLegacyAgain(
        page: Page,
        cls: ClassId | MultiClassId,
        send: () => Promise<number>,
    ): Promise<void> {
        const want = legacy.classes[cls] as Answer;
        expect(want, `no legacy answer for ${cls}`).toBeDefined();
        const log = webLogPath();
        const since = mark(log);
        const calls = await send();
        expect(calls, `${cls}: rollback answer ${calls}, legacy answer ${want.calls}`).toBe(
            want.calls,
        );
        // A decision line is written while the server answers; the install-url poll in installCalls already waited for it.
        await page.waitForTimeout(500);
        expect(
            decisionClientLines(log, since, ENFORCED),
            `${cls}: the decision client was asked after enforce was switched off`,
        ).toBe(0);
    }

    for (const cls of ["owner", "admin", "member", "viewer"] as const) {
        test(`${cls}: integrations.write answer equals the legacy answer after the switch-off`, async ({
            browser,
        }, testInfo) => {
            const want = legacy.classes[cls] as Answer;
            expect(want, `no legacy answer for ${cls}`).toBeDefined();
            const page = await newUserPage(browser, testInfo.project.use.baseURL);
            await signInUser(page, want.email, PASSWORD);
            expect(await sessionOrgId(page), `the ${cls}'s session organization`).toBe(
                legacy.orgId,
            );
            await expectLegacyAgain(page, cls, () => installCalls(page));
            expect(want.calls, `${cls}: the legacy value`).toBe(LEGACY_VALUE[cls] ? 1 : 0);
        });
    }

    test("superuser with no membership row: integrations.write answer equals the legacy answer after the switch-off", async ({
        browser,
        request,
    }, testInfo) => {
        const superToken = (await getSuperuserToken(request)) as string;
        expect(superToken, "the seeded superuser cannot log in").not.toBeNull();
        const page = await newUserPage(browser, testInfo.project.use.baseURL);
        await superuserSessionWithoutRow(page, request, superToken, legacy.orgId);
        // The platform shadow is still live after the switch-off (observed, not read from config).
        await expectPlatformShadow(page);
        expect(await sessionOrgId(page), "superuser: the session organization").toBe(legacy.orgId);
        await expectLegacyAgain(page, "superuser", () => installCalls(page));
    });

    for (const cls of MULTI_CLASSES) {
        test(`multi-org ${cls}: integrations.write answer in organization B equals the legacy answer after the switch-off`, async ({
            browser,
        }, testInfo) => {
            const want = legacy.classes[cls] as Answer;
            expect(want, `no legacy answer for ${cls}`).toBeDefined();
            expect(legacy.orgB, "the legacy answers name no organization B").toBeTruthy();
            const page = await newUserPage(browser, testInfo.project.use.baseURL);
            await signInWithOrg(page, want.email, PASSWORD, legacy.orgB as string, cls);
            expect(await sessionOrgId(page), `${cls}: the session organization`).toBe(legacy.orgB);
            await expectLegacyAgain(page, cls, () => installCalls(page));
            expect(want.calls, `${cls}: the legacy value`).toBe(MULTI_LEGACY_VALUE[cls] ? 1 : 0);
        });
    }

    test("the whole switch-off pass: no decision-client verdict for any enforced action", () => {
        const log = webLogPath();
        expect(
            decisionClientLines(log, 0, ENFORCED),
            "the rollback pass logged a decision-client verdict for an enforced action",
        ).toBe(0);
        expect(decisionClientLines(log), "the rollback pass logged a decision-client verdict").toBe(
            0,
        );
        expect(pdpDecideLines(log), "the rollback pass logged a PDP verdict").toBe(0);
    });
});
