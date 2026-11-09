/**
 * admin.users answers per caller class, legacy vs PDP, on the same stack (flip F11 step 4 gate G3).
 *
 * Two passes of the web server (ci/run_tests.sh live-e2e-web-decisions-admin-users): "admin-users-legacy"
 * (AUTHZ_PLATFORM_UI=shadow, enforce off: the legacy superuser rule decides, the yardstick) and then "admin-users-enforce" (the
 * same plus AUTHZ_DECISIONS_ENFORCE=on: the PDP decides). Each caller POSTs the create-platform-user server action DIRECTLY
 * (src/lib/admin/server/users.ts createPlatformUser): a server action is its own POST endpoint, so the /superadmin layout guard
 * proves nothing about who can reach it. The action's own guard (requireSuperuserToken, guard platform.users, action
 * admin.users) is what is measured.
 *
 * The answer is whether web sent POST /api/v1/admin/users to go-api (the go-api access log, an exact 0 or 1 from a mark) AND
 * whether the user row exists afterwards (the admin API, by the unique email). A deny returns before the go-api call.
 */
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
    expect,
    test,
    type APIRequestContext,
    type APIResponse,
    type Browser,
    type Page,
    type Response,
} from "@playwright/test";
import {
    authHeaders,
    dropAutoOrg,
    expectRegisterAccepted,
    getSuperuserToken,
    liveBackendUrl,
    superuserEmail,
    superuserPassword,
    testEmail,
    userIdByEmail,
    verifyUserViaStack,
} from "./helpers";
import {
    mark,
    nextDecision,
    pdpDecideLines,
    shadowRunsOf,
    signInUser,
    webLogPath,
} from "./web-decisions.helpers";

const PASSWORD = "TestPass123!";
// The page whose module imports the action: the action POST goes to it, as the browser's own call does.
const NEW_USER_PAGE = "/superadmin/users/new";
const ADMIN_USERS_ROUTE = "/api/v1/admin/users";
const ACTION_NAME = "createPlatformUser";

type ClassId = "superuser" | "owner" | "admin" | "member" | "viewer";
const ROLES = ["owner", "admin", "member", "viewer"] as const;
// The legacy value of each class (catalog.ts platform.users: the superuser rule): only the superuser creates.
const LEGACY_VALUE: Record<ClassId, boolean> = {
    superuser: true,
    owner: false,
    admin: false,
    member: false,
    viewer: false,
};

interface Answer {
    // The caller's sign-in email.
    email: string;
    // 1 = web sent the create request to go-api (the guard allowed); 0 = the guard denied first.
    calls: number;
    // The created user's row exists afterwards.
    row: boolean;
}
interface Answers {
    orgId: string;
    classes: Partial<Record<ClassId, Answer>>;
}

function answersPath(): string {
    return join(dirname(webLogPath()), "admin-users-answers.json");
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

// go-api access lines ("http request") of POST /api/v1/admin/users: the route pattern, never /api/v1/admin/users/{id}.
function createCalls(path: string): number {
    let n = 0;
    for (const raw of readFileSync(path, "utf8").split("\n")) {
        if (!raw.startsWith("{")) continue;
        try {
            const l = JSON.parse(raw) as Record<string, unknown>;
            const route = String(l.route ?? l.path ?? "").split("?")[0];
            if (l.method === "POST" && route === ADMIN_USERS_ROUTE) n++;
        } catch {
            // A partial line at the end of a file that is still written.
        }
    }
    return n;
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

// The login form sends no org_id: the superuser signs in with org O through the credentials callback itself.
async function signInSuperuserWithOrg(page: Page, orgId: string): Promise<void> {
    const csrf = await page.request.get("/api/auth/csrf");
    await expectSetupAnswer(csrf, [200], "reading the CSRF token");
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    await expectSetupAnswer(
        await page.request.post("/api/auth/callback/credentials", {
            form: {
                csrfToken,
                email: superuserEmail,
                password: superuserPassword,
                org_id: orgId,
                callbackUrl: "/dashboard",
            },
            maxRedirects: 0,
        }),
        [302, 303, 200],
        "the superuser sign-in with the organization",
    );
    const session = await page.request.get("/api/auth/session");
    await expectSetupAnswer(session, [200], "reading the superuser session");
    const user = ((await session.json()) as { user?: { email?: string; org_id?: string } }).user;
    expect(user?.email, "the superuser sign-in made no session").toBe(superuserEmail);
    expect(user?.org_id, "superuser: the session organization after the sign-in").toBe(orgId);
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
        "superuser: membership rows in O before the create request",
    ).toBe(0);
}

async function newUserPage(browser: Browser, baseURL: string | undefined): Promise<Page> {
    const context = await browser.newContext({ baseURL });
    return context.newPage();
}

// Owned users: the admin PATCH is refused (409 operation_moved, CHAOS-11017); setup verifies through the stack verb.
function verifyUser(email: string, who: string): void {
    expect(verifyUserViaStack(email), `verifying the ${who}`).toBe(true);
}

// The enforce pass signs nobody in: auth-service allows 20 logins per client address in 15 minutes (limits.go loginIPLimit).
// The legacy pass keeps each class's session (and the superuser's API token) here, outside the uploaded log directory, 0600; the
// enforce pass sends its request with that session. A session the restarted server does not accept fails the cell at its
// session-organization check.
const SESSION_DIR = join(tmpdir(), "web-decisions-admin-users-sessions");

function sessionPath(cls: string): string {
    return join(SESSION_DIR, `${cls}.json`);
}

async function keepSession(page: Page, cls: string): Promise<void> {
    mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(sessionPath(cls), JSON.stringify(await page.context().storageState()), {
        mode: 0o600,
    });
}

async function keptSessionPage(
    browser: Browser,
    baseURL: string | undefined,
    cls: string,
): Promise<Page> {
    if (!existsSync(sessionPath(cls))) {
        throw new Error(`no kept session for ${cls}: the admin-users-legacy pass must run first`);
    }
    const context = await browser.newContext({ baseURL, storageState: sessionPath(cls) });
    return context.newPage();
}

function keptSuperToken(): string {
    const path = join(SESSION_DIR, "superuser.token");
    if (!existsSync(path)) {
        throw new Error("no kept superuser API token: the admin-users-legacy pass must run first");
    }
    return readFileSync(path, "utf8");
}

// The id of the create-platform-user action in this server's build: read from the client module the new-user page loads
// (createServerReference("<id>", ..., "createPlatformUser")), else from the dev server's server-reference manifest. Neither
// found = FAIL: a cell without the real action id measures nothing.
const ACTION_REFERENCE =
    /createServerReference[^(]{0,60}\)\(\s*\\?"([0-9a-f]{40,44})\\?"[\s\S]{0,800}?\\?"createPlatformUser\\?"\s*\)/;

function manifestActionId(): string {
    const found: string[] = [];
    const walk = (dir: string, depth: number) => {
        if (depth > 5 || !existsSync(dir)) return;
        for (const name of readdirSync(dir)) {
            const path = join(dir, name);
            let isDir = false;
            try {
                isDir = statSync(path).isDirectory();
            } catch {
                continue;
            }
            if (isDir) {
                if (name !== "node_modules" && name !== "cache") walk(path, depth + 1);
            } else if (name === "server-reference-manifest.json") {
                try {
                    const doc = JSON.parse(readFileSync(path, "utf8")) as Record<
                        string,
                        Record<string, { exportedName?: string; filename?: string }>
                    >;
                    for (const side of ["node", "edge"]) {
                        for (const [id, entry] of Object.entries(doc[side] ?? {})) {
                            if (
                                entry?.exportedName === ACTION_NAME &&
                                String(entry.filename ?? "").includes("admin/server/users")
                            )
                                found.push(id);
                        }
                    }
                } catch {
                    // A manifest that is being rewritten.
                }
            }
        }
    };
    walk(join(process.cwd(), ".next"), 0);
    return found[0] ?? "";
}

async function createPlatformUserActionId(page: Page): Promise<string> {
    const bodies: Promise<string>[] = [];
    const onResponse = (r: Response) => {
        const url = r.url();
        if (r.request().resourceType() === "script" || url.includes("/_next/static/")) {
            bodies.push(r.text().catch(() => ""));
        }
    };
    page.on("response", onResponse);
    try {
        // A fresh dev server compiles the page on this load: that can take far longer than the default.
        const res = await page.goto(NEW_USER_PAGE, { waitUntil: "load", timeout: 120_000 });
        expect(res?.status(), "the superuser could not load the new-user page").toBe(200);
        await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
    } finally {
        page.off("response", onResponse);
    }
    for (const text of await Promise.all(bodies)) {
        const m = text.match(ACTION_REFERENCE);
        if (m) return m[1];
    }
    let id = "";
    await expect
        .poll(
            () => {
                id = manifestActionId();
                return id;
            },
            {
                message: `no ${ACTION_NAME} action id in the page's client modules or the server-reference manifest`,
                timeout: 30_000,
            },
        )
        .not.toBe("");
    return id;
}

// The action POST as the browser sends it, from the caller's own page (same origin, its own session cookie).
const ACTION_POST = async ([path, actionId, body]: [string, string, string]) => {
    const res = await fetch(path, {
        method: "POST",
        headers: {
            "content-type": "text/plain;charset=UTF-8",
            "next-action": actionId,
            accept: "text/x-component",
        },
        body,
        redirect: "manual",
    });
    const text = await res.text();
    return {
        status: res.status,
        type: res.headers.get("content-type") ?? "",
        text: text.slice(0, 1500),
    };
};

// One create request by the caller on page, and its answer: the exact number of go-api create requests from a mark (0 or 1),
// and whether the created user's row exists afterwards. The row lookup must find the caller itself first, so a lookup that cannot
// see rows (an expired token, a refused call) fails the cell instead of reading "no row".
async function createAnswer(
    page: Page,
    request: APIRequestContext,
    superToken: string,
    actionId: string,
    callerEmail: string,
    who: string,
): Promise<{ calls: number; row: boolean; created: string }> {
    expect(
        await userIdByEmail(request, callerEmail, superToken),
        `${who}: the row lookup cannot see the caller itself, so "no row" would be no measurement`,
    ).not.toBe("");
    const created = testEmail(`g3-created-${who}`);
    const body = JSON.stringify([
        { email: created, password: PASSWORD, full_name: `G3 created by ${who}` },
    ]);
    // A page on the app origin: the action fetch must carry the app's Origin and the caller's cookie.
    expect((await page.goto("/api/auth/session"))?.status(), `${who}: the app origin`).toBe(200);
    const log = goApiLog();
    const before = createCalls(log);
    const res = await page.evaluate(ACTION_POST, [NEW_USER_PAGE, actionId, body] as [
        string,
        string,
        string,
    ]);
    // A wrong or unknown action id answers 404 (or a page, not a flight answer): that would read "denied" for a call that never
    // reached the guard, so anything but a 200 flight answer fails the cell.
    expect(
        `${res.status} ${res.type}`,
        `${who}: the action POST was not handled as a server action: ${res.text}`,
    ).toMatch(/^200 text\/x-component/);
    // web answers only after go-api answered, so an allow's access line is written by now or within a moment: look a few times.
    for (let i = 0; i < 20 && createCalls(log) === before; i++) await page.waitForTimeout(250);
    const calls = createCalls(log) - before;
    expect([0, 1], `${who}: go-api create requests for one action request: ${calls}`).toContain(
        calls,
    );
    const row = (await userIdByEmail(request, created, superToken)) !== "";
    return { calls, row, created };
}

function readLegacyAnswers(): Answers {
    let legacy: Answers;
    try {
        legacy = JSON.parse(readFileSync(answersPath(), "utf8")) as Answers;
    } catch {
        throw new Error(
            `no legacy answers at ${answersPath()}: the admin-users-legacy pass must run first`,
        );
    }
    expect(legacy.orgId, "the legacy answers name no organization").not.toBe("");
    return legacy;
}

test.describe("admin.users per caller class, legacy decides @admin-users-legacy", () => {
    test("each class's legacy answer on the create-platform-user action is recorded for the enforce pass", async ({
        browser,
        request,
    }, testInfo) => {
        // No session of an earlier run may reach the enforce pass.
        rmSync(SESSION_DIR, { recursive: true, force: true });
        const superToken = (await getSuperuserToken(request)) as string;
        expect(superToken, "the seeded superuser cannot log in").not.toBeNull();
        const baseURL = testInfo.project.use.baseURL;
        const answers: Answers = { orgId: "", classes: {} };

        // owner: a registered user owns its own organization O (the default live backend).
        const ownerEmail = testEmail("g3-owner");
        expectRegisterAccepted(
            await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
                data: { email: ownerEmail, password: PASSWORD, full_name: "G3 Owner" },
                headers: { Origin: liveBackendUrl },
            }),
        );
        const ownerId = await userIdByEmail(request, ownerEmail, superToken);
        expect(ownerId, "the owner is not in the admin user list").not.toBe("");
        verifyUser(ownerEmail, "owner");
        const pages: Partial<Record<ClassId, Page>> = {};
        pages.owner = await newUserPage(browser, baseURL);
        await signInUser(pages.owner, ownerEmail, PASSWORD);
        answers.orgId = await sessionOrgId(pages.owner);
        expect(answers.orgId, "the owner has no organization").not.toBe("");
        const emails: Record<ClassId, string> = {
            superuser: superuserEmail,
            owner: ownerEmail,
            admin: "",
            member: "",
            viewer: "",
        };

        // admin, member, viewer: platform users with no organization, added to O with the role, so O is their only membership
        // and their session organization.
        for (const role of ["admin", "member", "viewer"] as const) {
            const email = testEmail(`g3-${role}`);
            // Users are owned by auth-service: POST /api/v1/admin/users answers 409 operation_moved (CHAOS-13376), so the user
            // registers through the prod route and is verified through the stack verb; the membership route is not refused while
            // owned (ops apiservice/admin/orgs.go:29 has no owned guard; orgs_provision.go:121 writes through the auth change path).
            expectRegisterAccepted(
                await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
                    data: { email, password: PASSWORD, full_name: `G3 ${role}` },
                    headers: { Origin: liveBackendUrl },
                }),
            );
            verifyUser(email, role);
            // Register auto-creates an owned org; drop it so O is the user's only membership and session org.
            await dropAutoOrg(request, email, PASSWORD, superToken);
            const userId = await userIdByEmail(request, email, superToken);
            expect(userId, `the ${role} is not in the admin user list`).not.toBe("");
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
            pages[role] = page;
            emails[role] = email;
        }

        // superuser with no membership row in O, session in O. Its page load compiles the new-user page (the action's module) and
        // gives the action id; its own create is the positive control of the counter (it must read 1 and a row).
        const superPage = await newUserPage(browser, baseURL);
        await superuserSessionWithoutRow(superPage, request, superToken, answers.orgId);
        await expectPlatformShadow(superPage);
        const actionId = await createPlatformUserActionId(superPage);
        pages.superuser = superPage;

        for (const cls of ["superuser", ...ROLES] as const) {
            const page = pages[cls] as Page;
            expect(await sessionOrgId(page), `${cls}: the session organization`).toBe(
                answers.orgId,
            );
            const a = await createAnswer(page, request, superToken, actionId, emails[cls], cls);
            answers.classes[cls] = { email: emails[cls], calls: a.calls, row: a.row };
            await keepSession(page, cls);
        }
        writeFileSync(join(SESSION_DIR, "superuser.token"), superToken, { mode: 0o600 });
        writeFileSync(answersPath(), JSON.stringify(answers, null, 2));
        testInfo.annotations.push({
            type: "report",
            description: `legacy: ${Object.entries(answers.classes)
                .map(([c, a]) => `${c} calls=${a?.calls} row=${a?.row}`)
                .join("; ")}`,
        });

        // The legacy pass: the legacy values (the superuser reads 1 and a row: the counter works), and no PDP verdict at all.
        for (const cls of ["superuser", ...ROLES] as const) {
            const want = LEGACY_VALUE[cls];
            expect(
                answers.classes[cls]?.calls,
                `legacy: ${cls} admin.users go-api create requests`,
            ).toBe(want ? 1 : 0);
            // KNOWN DIVERGENCE CHAOS-13376: while users are owned, go-api refuses the create (409 operation_moved), so the
            // superuser's request reaches go-api (calls 1) and no row is created. When 13376 lands this reads true and goes red.
            expect(answers.classes[cls]?.row, `legacy: ${cls} admin.users created row`).toBe(false);
        }
        expect(pdpDecideLines(webLogPath()), "the legacy pass logged a PDP verdict").toBe(0);
    });
});

test.describe("admin.users create under owned users @admin-users-legacy", () => {
    // KNOWN DIVERGENCE CHAOS-13376 (not intended behaviour): the /superadmin/users/new flow sends POST /api/v1/admin/users, and while
    // auth-service owns users go-api answers 409 operation_moved (ops apiservice/admin/users.go:246-248; body from
    // internal/api/usersowned/usersowned.go:78 Write via policy.WriteDetail, internal/api/policy/respond.go:95). When 13376 lands
    // the create answers 201, and this test goes red on purpose: replace it with the create-and-row assertion.
    test("known divergence 13376: the superuser's platform-user create is refused 409 operation_moved", async ({
        request,
    }) => {
        const superToken = (await getSuperuserToken(request)) as string;
        expect(superToken, "the seeded superuser cannot log in").not.toBeNull();
        const email = testEmail("kd-13376");
        const res = await request.post(`${liveBackendUrl}${ADMIN_USERS_ROUTE}`, {
            headers: authHeaders(superToken),
            data: { email, password: PASSWORD, full_name: "KD 13376" },
        });
        expect(
            res.status(),
            `create answered ${res.status()}: ${(await res.text()).slice(0, 500)}`,
        ).toBe(409);
        expect(await res.json()).toEqual({
            detail: {
                message:
                    "This operation is served by the authentication service while it owns users",
                reason: "operation_moved",
            },
        });
        expect(await userIdByEmail(request, email, superToken), "no row is created").toBe("");
    });
});

test.describe("admin.users per caller class, the PDP decides @admin-users-enforce", () => {
    // The superuser runs first: its allow is the positive control of the counter in this pass.
    let legacy: Answers;
    let actionId = "";
    test.beforeAll(() => {
        legacy = readLegacyAnswers();
    });

    async function enforceCell(
        browser: Browser,
        request: APIRequestContext,
        baseURL: string | undefined,
        cls: ClassId,
    ): Promise<void> {
        const want = legacy.classes[cls] as Answer;
        expect(want, `no legacy answer for ${cls}`).toBeDefined();
        const superToken = keptSuperToken();
        // The id once per worker (a failed cell restarts the worker, and the next cell reads it again). No shadow check here:
        // the platform shadow samples one run per user, organization and surface set, so a second check would read a skip.
        if (actionId === "") {
            const superPage = await keptSessionPage(browser, baseURL, "superuser");
            expect(await sessionOrgId(superPage), "superuser: the kept session organization").toBe(
                legacy.orgId,
            );
            actionId = await createPlatformUserActionId(superPage);
        }
        const page = await keptSessionPage(browser, baseURL, cls);
        expect(await sessionOrgId(page), `${cls}: the kept session organization`).toBe(
            legacy.orgId,
        );
        const log = webLogPath();
        const since = mark(log);
        const a = await createAnswer(page, request, superToken, actionId, want.email, cls);
        // The yardstick first: the same request gave this answer with legacy deciding (any difference is a parity defect: STOP).
        expect(a.calls, `${cls}: PDP answer ${a.calls}, legacy answer ${want.calls}`).toBe(
            want.calls,
        );
        expect(a.row, `${cls}: PDP created row ${a.row}, legacy created row ${want.row}`).toBe(
            want.row,
        );
        const line = await nextDecision(log, since, "platform.users");
        expect(line.action).toBe("admin.users");
        expect(line.source, `${cls}: not decided by the PDP`).toBe("pdp");
        expect(line.allowed, `${cls}: the decision line and the request disagree`).toBe(
            a.calls === 1,
        );
        // Counter self-check: only the superuser reads 1 in this pass too.
        expect(a.calls, `${cls}: the legacy value`).toBe(LEGACY_VALUE[cls] ? 1 : 0);
    }

    test("superuser with no membership row: admin.users answer equals the legacy answer", async ({
        browser,
        request,
    }, testInfo) => {
        // AUTHZ_PLATFORM_UI=shadow is live in this pass too (observed once, by the first cell).
        await expectPlatformShadow(
            await keptSessionPage(browser, testInfo.project.use.baseURL, "superuser"),
        );
        await enforceCell(browser, request, testInfo.project.use.baseURL, "superuser");
    });

    for (const cls of ROLES) {
        test(`${cls}: admin.users answer equals the legacy answer`, async ({
            browser,
            request,
        }, testInfo) => {
            await enforceCell(browser, request, testInfo.project.use.baseURL, cls);
        });
    }
});
