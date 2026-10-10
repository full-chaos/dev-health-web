import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { OPS_MOCK_ORIGIN } from "../playwright.context-fabric.config";

/**
 * CHAOS-9105: per-row links of the admin lists, against the PRODUCTION build.
 *
 * This file runs only in the production-build suite (`playwright.context-fabric.config.ts`,
 * `pnpm test:e2e:context-fabric`). The default suite runs `next dev`, and a development server
 * does not prefetch links, so the count below would be 0 there for any code.
 *
 * What happened on 2026-10-10: an idle `/org/admin/teams` with 13 teams sent about 100 requests
 * per second to production. The team ids were `jira:<uuid>`. The href held the id raw; the server
 * answers a prefetch with the route tree segment in `encodeURIComponent` form (`jira%3A<uuid>`);
 * from the fifth link of a route the Next.js 16.3.8 router builds that segment from the href, so
 * the two never agreed and the router asked again at once, with no limit.
 */

const JIRA_IDS = Array.from(
    { length: 8 },
    (_, index) => `jira:8012df0c-1a2b-4c3d-9e4f-${String(index + 1).padStart(12, "0")}`,
);
/** Ids that a raw href sent to the wrong route (`/`), to a server error (`%`), or into the loop. */
const SPECIAL_TEAM_IDS = ["custom:alpha", "R&D", "a/b", "50%", "linear:CHAOS"];
const TEAMS = [...JIRA_IDS, ...SPECIAL_TEAM_IDS].map((team_id, index) => ({
    team_id,
    name: `Row ${String(index + 1).padStart(2, "0")} team`,
}));
const IDENTITY = { canonical_id: "person+ops@example.com", display_name: "Ops Person" };

const EDIT_ROUTE = /^\/org\/admin\/(?:teams|identities)\/.+\/edit$/u;
/** The idle time of the count. On the unchanged code 30 s gave about 3,600 requests. */
const IDLE_MS = 30_000;

async function seedAdminRows(
    request: APIRequestContext,
    seed: { teams: typeof TEAMS; identities: (typeof IDENTITY)[] },
): Promise<void> {
    const response = await request.post(`${OPS_MOCK_ORIGIN}/__test/admin-rows`, { data: seed });
    expect(response.status()).toBe(204);
}

type RequestCounts = { editRoute: string[]; otherPrefetch: string[] };

/** Records every GET for an edit route of a row, and every other router prefetch. */
function countRequests(page: Page): RequestCounts {
    const counts: RequestCounts = { editRoute: [], otherPrefetch: [] };
    page.on("request", (request) => {
        if (request.method() !== "GET") return;
        const { pathname } = new URL(request.url());
        if (EDIT_ROUTE.test(pathname)) counts.editRoute.push(pathname);
        else if (request.headers()["next-router-prefetch"] === "1") {
            counts.otherPrefetch.push(pathname);
        }
    });
    return counts;
}

function teamRows(page: Page) {
    return page.getByRole("region", { name: "Teams" }).locator("tbody tr");
}

test.describe("admin list row links (production build)", () => {
    test.beforeEach(async ({ request }) => {
        await seedAdminRows(request, { teams: TEAMS, identities: [IDENTITY] });
    });

    test.afterAll(async ({ request }) => {
        await request.post(`${OPS_MOCK_ORIGIN}/__test/admin-rows`, {
            data: { teams: [], identities: [] },
        });
    });

    test("an idle teams list sends no request for the edit route of a row", async ({ page }) => {
        test.setTimeout(IDLE_MS + 60_000);
        const counts = countRequests(page);

        await page.goto("/org/admin/teams");
        await expect(teamRows(page)).toHaveCount(TEAMS.length);
        // Rows 5 and later are the ones that looped; row 5 is in view at the default viewport.
        await expect(teamRows(page).nth(4).getByRole("link").first()).toBeInViewport();
        // Soft: a raw href fails here AND the count below still runs and shows its number.
        await expect
            .soft(teamRows(page).nth(4).getByRole("link").first())
            .toHaveAttribute("href", `/org/admin/teams/${encodeURIComponent(JIRA_IDS[4])}/edit`);

        await page.waitForTimeout(IDLE_MS);

        // The measurement must be able to see a prefetch: the shell links are prefetched in a
        // production build. Zero here means the server is not a production build, and then the
        // count below proves nothing.
        expect(counts.otherPrefetch.length).toBeGreaterThan(0);
        expect(counts.editRoute.length).toBe(0);
    });

    test("a click on a row link opens the edit page of that team, with no repeat", async ({
        page,
    }) => {
        const counts = countRequests(page);
        const teamId = JIRA_IDS[6];
        const editPath = `/org/admin/teams/${encodeURIComponent(teamId)}/edit`;

        await page.goto("/org/admin/teams");
        await teamRows(page).nth(6).getByRole("link", { name: "Row 07 team" }).click();

        await expect(page).toHaveURL((url) => url.pathname === editPath);
        await expect(page.getByRole("heading", { name: "Edit Team" })).toBeVisible();
        await expect(page.locator("#team_id")).toHaveValue(teamId);

        await page.waitForTimeout(5_000);
        // The navigation itself. A router that asks again shows up as tens of requests in 5 s.
        expect(counts.editRoute.filter((path) => path === editPath).length).toBeLessThanOrEqual(2);
    });

    for (const teamId of SPECIAL_TEAM_IDS) {
        test(`the row link of team id ${JSON.stringify(teamId)} reaches that team`, async ({
            page,
        }) => {
            const row = TEAMS.findIndex((team) => team.team_id === teamId);

            await page.goto("/org/admin/teams");
            const link = teamRows(page).nth(row).getByRole("link", { name: TEAMS[row].name });
            await expect(link).toHaveAttribute(
                "href",
                `/org/admin/teams/${encodeURIComponent(teamId)}/edit`,
            );
            await link.click();

            await expect(page.getByRole("heading", { name: "Edit Team" })).toBeVisible();
            await expect(page.locator("#team_id")).toHaveValue(teamId);
            await expect(page.locator("#name")).toHaveValue(TEAMS[row].name);
        });
    }

    test("the row link of an identity id with `+` and `@` reaches that identity", async ({
        page,
    }) => {
        await page.goto("/org/admin/identities");
        const link = page
            .getByRole("region", { name: "Identities" })
            .getByRole("link", { name: IDENTITY.display_name });
        await expect(link).toHaveAttribute(
            "href",
            `/org/admin/identities/${encodeURIComponent(IDENTITY.canonical_id)}/edit`,
        );
        await link.click();

        await expect(page.getByRole("heading", { name: "Edit Identity" })).toBeVisible();
        await expect(page.locator("#canonical_id")).toHaveValue(IDENTITY.canonical_id);
    });
});
