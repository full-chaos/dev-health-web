import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-3584 (I-22): the page context proposed as chips in the real Ask Dev panel, and sent with
// the next question as ACR subject hints. The test-mode page context (`pageContext/
// AskDevPageContext.tsx`) registers the entities of "the page" from session storage, as a page will
// (CHAOS-11938); the test-mode transport plays a scripted ACR stream and records every call. No
// request leaves the browser for ACR.
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURES = join(process.cwd(), "tests/fixtures/ask-dev/captures");
const KEYS = {
    stream: "ask-dev:test-mode-stream",
    calls: "ask-dev:test-mode-calls",
    pageContext: "ask-dev:test-mode-page-context",
} as const;

const capture = (file: string) =>
    (JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as { result: Record<string, unknown> })
        .result;
const PARTIAL = capture("kiac_project_status_partial.event.json");
const CLARIFICATION = capture("kiac_project_status_clarification.event.json");

const event = (seq: number, body: Record<string, unknown>) => ({
    schema_version: "context_fabric_investigation_event.v1",
    request_id: "request_e2e",
    seq,
    ...body,
});
const accepted = event(1, {
    type: "accepted",
    reserved_result_id: "result_reserved_e2e_0001",
    started_at: "2026-10-31T12:00:00Z",
    budget_seconds: 110,
});
const answers = (result: Record<string, unknown>) => ({
    events: [accepted, event(2, { type: "result", result })],
});

const ORG = { kind: "organization", id: "org-e2e", label: "E2E Organization" };
const REPO = {
    kind: "repository",
    id: "repo:full-chaos/dev-health-web",
    label: "full-chaos/dev-health-web",
};
const TEAM = { kind: "team", id: "team:platform", label: "Platform" };
const DEPLOYMENT = { kind: "deployment", id: "deploy:1", label: "Deploy 1" };

type Call = { kind: string; request?: { requested_scope?: { subject_hints: unknown[] } } };

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

async function seed(page: Page, script: { stream: unknown[]; refs: unknown[] }) {
    await page.addInitScript(
        ([keys, stream, refs]) => {
            if (window.sessionStorage.getItem("ask-dev:test-mode-seeded") === "1") return;
            window.sessionStorage.setItem("ask-dev:test-mode-seeded", "1");
            window.sessionStorage.setItem(keys.stream, stream);
            window.sessionStorage.setItem(keys.pageContext, refs);
        },
        [KEYS, JSON.stringify(script.stream), JSON.stringify(script.refs)] as const,
    );
}

const investigations = async (page: Page) =>
    (
        await page.evaluate(
            (key) => JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as Call[],
            KEYS.calls,
        )
    ).filter((call) => call.kind === "investigate");

async function axeViolations(page: Page, selector: string): Promise<string[]> {
    await page.evaluate(readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"));
    return page.evaluate(async (target) => {
        const axe = (window as unknown as { axe: typeof import("axe-core") }).axe;
        const node = document.querySelector(target);
        if (!node) return ["target not found"];
        const result = await axe.run(node);
        return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
    }, selector);
}

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("the page's context shows as chips; opening sends nothing; the chips left go as hints", async ({
        page,
    }, testInfo) => {
        await seed(page, { stream: [answers(PARTIAL)], refs: [ORG, REPO, TEAM, DEPLOYMENT] });
        await page.goto("/investment");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        const context = panel.getByRole("group", { name: "Context from this page" });
        await expect(context.getByTestId("ask-dev-context-chip")).toHaveText([
            "Organization:E2E Organization",
            "Repository:full-chaos/dev-health-web",
            "Team:Platform",
        ]);
        await panel.screenshot({ path: testInfo.outputPath("context-chips-desktop.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);
        expect(await investigations(page)).toHaveLength(0);

        await context
            .getByRole("button", { name: "Remove Repository full-chaos/dev-health-web" })
            .click();
        await expect(context.getByTestId("ask-dev-context-chip")).toHaveCount(2);
        await panel.screenshot({ path: testInfo.outputPath("context-chip-removed-desktop.png") });
        const input = panel.getByRole("textbox", { name: "Ask a question" });
        await input.fill("Where is the team's effort going?");
        await input.press("Enter");
        await expect(panel.getByTestId("answer-panel")).toBeVisible();

        const [sent] = await investigations(page);
        expect(sent!.request!.requested_scope).toEqual({
            subject_hints: [
                { ...ORG, source: "ask_dev_page_context" },
                { ...TEAM, source: "ask_dev_page_context" },
            ],
        });
    });

    test("a tampered id goes as a hint only, and the answer asks which one", async ({
        page,
    }, testInfo) => {
        const forged = { ...REPO, id: "repo:another-org/secret" };
        await seed(page, { stream: [answers(CLARIFICATION)], refs: [forged] });
        await page.goto("/investment");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        const input = panel.getByRole("textbox", { name: "Ask a question" });
        await input.fill("What is the status of this repository?");
        await input.press("Enter");
        // CHAOS-12384: the render asks in a popup above the composer, one question per page.
        await expect(panel.getByRole("article", { name: "Answer" })).toHaveAttribute(
            "data-state",
            "clarification_required",
        );
        await expect(panel.getByRole("dialog", { name: "Over what period?" })).toBeVisible();
        await panel.screenshot({ path: testInfo.outputPath("context-tampered-desktop.png") });
        const [sent] = await investigations(page);
        expect(sent!.request!.requested_scope).toEqual({
            subject_hints: [{ ...forged, source: "ask_dev_page_context" }],
        });
    });

    test("a page that is not an approved surface proposes nothing", async ({ page }) => {
        await seed(page, { stream: [answers(PARTIAL)], refs: [ORG] });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await expect(panel.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
        await expect(panel.getByTestId("ask-dev-context")).toHaveCount(0);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the sheet shows the chips with no sideways scroll", async ({ page }, testInfo) => {
        await seed(page, { stream: [answers(PARTIAL)], refs: [ORG, REPO, TEAM] });
        await page.goto("/investment");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByTestId("ask-dev-sheet");
        await expect(sheet.getByTestId("ask-dev-context-chip")).toHaveCount(3);
        await sheet.getByTestId("ask-dev-context").scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath("context-chips-mobile.png") });
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
    });
});
