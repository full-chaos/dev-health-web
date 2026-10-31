import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

import { defaultMetricFilter } from "../src/lib/filters/defaults";
import { encodeFilter } from "../src/lib/filters/encode";
import type { MetricFilter } from "../src/lib/filters/types";

// CHAOS-11938 (I-23): each approved page states its own Ask Dev context. No test-mode page context
// is seeded: the chips come from the page's own registration, through the shell's registry. The
// test-mode transport plays a scripted ACR stream and records every call; no request leaves the
// browser for ACR. The mock backend serves the organization "E2E Organization" (`org-e2e`), the
// teams by id with no names, and the repository id -> name map.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "src/components/ask-dev/answer/__tests__/captures");
const KEYS = { stream: "ask-dev:test-mode-stream", calls: "ask-dev:test-mode-calls" } as const;
const SOURCE = "ask_dev_page_context";

const PARTIAL = (
    JSON.parse(readFileSync(join(CAPTURES, "kiac_project_status_partial.event.json"), "utf8")) as {
        result: Record<string, unknown>;
    }
).result;
const event = (seq: number, body: Record<string, unknown>) => ({
    schema_version: "context_fabric_investigation_event.v1",
    request_id: "request_e2e",
    seq,
    ...body,
});
const ANSWER = {
    events: [
        event(1, {
            type: "accepted",
            reserved_result_id: "result_reserved_e2e_0001",
            started_at: "2026-10-31T12:00:00Z",
            budget_seconds: 110,
        }),
        event(2, { type: "result", result: PARTIAL }),
    ],
};

const ORG = { kind: "organization", id: "organization:org-e2e", label: "E2E Organization" };
const TEAM = { kind: "team", id: "team:core", label: "core" };
const WEB_REPO = {
    kind: "repository",
    id: "repository:00000000-0000-4000-8000-0000000e2e01",
    label: "dev-health-web",
};

const filter = (patch: Partial<MetricFilter>) => encodeFilter({ ...defaultMetricFilter, ...patch });
const ONE_TEAM = filter({ scope: { level: "team", ids: ["core"] } });
// These views lock the scope to teams (the scope bar rewrites any other level), so a page's one
// repository is the repository filter.
const ONE_REPO = filter({ what: { repos: ["dev-health-web"] } });

type Call = { kind: string; request?: { requested_scope?: unknown } };

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

async function seedStream(page: Page) {
    await page.addInitScript(
        ([keys, stream]) => {
            if (window.sessionStorage.getItem("ask-dev:test-mode-seeded") === "1") return;
            window.sessionStorage.setItem("ask-dev:test-mode-seeded", "1");
            window.sessionStorage.setItem(keys.stream, stream);
        },
        [KEYS, JSON.stringify([ANSWER])] as const,
    );
}

const investigations = async (page: Page) =>
    (
        await page.evaluate(
            (key) => JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as Call[],
            KEYS.calls,
        )
    ).filter((call) => call.kind === "investigate");

/**
 * Opens Ask Dev once the launcher is hydrated. On a constrained CI runner the server-rendered
 * launcher is clickable before its handler hydrates, and that click is lost (CI run 41197195971:
 * the launcher focused, the panel never opened). Retry the click and its result together, as
 * `admin-sync-observability.spec.ts` does, and never click a launcher that is already open.
 */
async function openAskDev(page: Page, surface: Locator) {
    const launcher = page.getByRole("button", { name: "Open Ask Dev" });
    await expect(async () => {
        if ((await launcher.getAttribute("aria-expanded")) !== "true") await launcher.click();
        await expect(surface).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30000, intervals: [300, 700, 1500] });
    return surface;
}

async function openPanel(page: Page, path: string) {
    await seedStream(page);
    await page.goto(path);
    return openAskDev(page, page.getByRole("complementary", { name: "Ask Dev" }));
}

async function expectChips(page: Page, path: string, chips: string[]) {
    const panel = await openPanel(page, path);
    const context = panel.getByRole("group", { name: "Context from this page" });
    await expect(context.getByTestId("ask-dev-context-chip")).toHaveText(chips);
    expect(await investigations(page)).toHaveLength(0);
    return panel;
}

async function askAndReadScope(page: Page, panel: ReturnType<Page["getByRole"]>) {
    const input = panel.getByRole("textbox", { name: "Ask a question" });
    await input.fill("Where is the effort going?");
    await input.press("Enter");
    await expect(panel.getByTestId("ask-dev-answer")).toBeVisible();
    const [sent] = await investigations(page);
    return sent?.request?.requested_scope;
}

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test.describe("each approved page states its context", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test.beforeEach(async ({ request }) => {
        await setScenario(request, "provisioned");
    });

    test("flow: the organization and the page's one team, sent as hints and nothing else", async ({
        page,
    }, testInfo) => {
        const panel = await expectChips(page, `/metrics?f=${ONE_TEAM}`, [
            "Organization:E2E Organization",
            "Team:core",
        ]);
        await panel.screenshot({ path: testInfo.outputPath("context-flow-desktop.png") });
        expect(await askAndReadScope(page, panel)).toEqual({
            subject_hints: [
                { ...ORG, source: SOURCE },
                { ...TEAM, source: SOURCE },
            ],
        });
    });

    test("flow: several teams propose the organization only", async ({ page }) => {
        await expectChips(
            page,
            `/metrics?f=${filter({ scope: { level: "team", ids: ["core", "growth"] } })}`,
            ["Organization:E2E Organization"],
        );
    });

    test("complexity: the page's one repository only; the route takes no team", async ({
        page,
    }) => {
        // Lead ruling on #1647: only the kinds the route allows (complexity: repositories).
        await expectChips(
            page,
            `/complexity?f=${filter({
                scope: { level: "team", ids: ["core"] },
                what: { repos: ["dev-health-web"] },
            })}`,
            ["Repository:dev-health-web"],
        );
    });

    test("complexity: a repository scope stays the page's scope, and is sent by its id", async ({
        page,
    }) => {
        // The scope bar locks only a view with page filters; Complexity has none (codex r3 on
        // #1647). Sent after any rewrite of the URL, so a one-render proposal would fail here.
        const panel = await expectChips(
            page,
            `/complexity?f=${filter({ scope: { level: "repo", ids: ["dev-health-web"] } })}`,
            ["Repository:dev-health-web"],
        );
        expect(await askAndReadScope(page, panel)).toEqual({
            subject_hints: [{ ...WEB_REPO, source: SOURCE }],
        });
    });

    test("cognitive load: the organization, the team and the repository filter", async ({
        page,
    }) => {
        await expectChips(
            page,
            `/cognitive-load?f=${filter({
                scope: { level: "team", ids: ["core"] },
                what: { repos: ["dev-health-web"] },
            })}`,
            ["Organization:E2E Organization", "Team:core", "Repository:dev-health-web"],
        );
    });

    test("bottlenecks: the organization and the page's one repository, by its served id", async ({
        page,
    }) => {
        const panel = await expectChips(page, `/bottleneck?f=${ONE_REPO}`, [
            "Organization:E2E Organization",
            "Repository:dev-health-web",
        ]);
        // The filter holds the name; the hint carries the id the served name map gives it.
        expect(await askAndReadScope(page, panel)).toEqual({
            subject_hints: [
                { ...ORG, source: SOURCE },
                { ...WEB_REPO, source: SOURCE },
            ],
        });
    });

    test("data health: the organization", async ({ page }) => {
        await expectChips(page, "/data-health", ["Organization:E2E Organization"]);
    });

    test("pull request detail: the served pull request, by ACR's id", async ({
        page,
    }, testInfo) => {
        const panel = await expectChips(page, "/prs/repo-e2e%23pr2911", [
            "Pull request:Context Fabric browser verification",
        ]);
        await panel.screenshot({ path: testInfo.outputPath("context-pr-desktop.png") });
        expect(await askAndReadScope(page, panel)).toEqual({
            subject_hints: [
                {
                    kind: "pull_request",
                    id: "pull_request:repo-e2e:2911",
                    label: "Context Fabric browser verification",
                    source: SOURCE,
                },
            ],
        });
    });
});

test.describe("investment", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test.beforeEach(async ({ request }) => {
        await setScenario(request, "provisioned-investment");
    });

    test("the organization and the page's one team", async ({ page }) => {
        await expectChips(page, `/investment?f=${ONE_TEAM}`, [
            "Organization:E2E Organization",
            "Team:core",
        ]);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test.beforeEach(async ({ request }) => {
        await setScenario(request, "provisioned");
    });

    test("the sheet shows a page's chips with no sideways scroll", async ({ page }, testInfo) => {
        await seedStream(page);
        await page.goto(
            `/cognitive-load?f=${filter({
                scope: { level: "team", ids: ["core"] },
                what: { repos: ["dev-health-web"] },
            })}`,
        );
        const sheet = await openAskDev(page, page.getByTestId("ask-dev-sheet"));
        await expect(sheet.getByTestId("ask-dev-context-chip")).toHaveCount(3);
        await sheet.getByTestId("ask-dev-context").scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("context-cognitive-load-mobile.png") });
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
});
