import { expect, test, type Locator } from "@playwright/test";

import {
    askDevAnswerArticle,
    askDevTranscript,
    getAskDevRequestCounts,
    openAskDevWindow,
    resetAskDevMock,
    scenarioQuestion,
    submitAskDevQuestion,
} from "./helpers/askDev";

const INTERNAL_TERMS = [
    "graph_assisted",
    "team_pressure",
    "truncated_traversal",
    "Graphiti",
    "Cypher",
    "canonical_enrichment",
    "health:stale_capacity",
    "metrics:metric:0123456789abcdef0123456789abcdef",
    "cognitive_workload_pressure",
    "available_stale",
    "no_data",
    "cognitive_load",
];

function normalizeAnswerText(value: string): string {
    return value.replace(/\s+/gu, " ").trim();
}

async function expectRichCohortFacts(answer: Locator): Promise<void> {
    const includedContext = answer.getByRole("region", { name: "Included context" });
    await expect(includedContext.getByLabel("Rank 1")).toBeVisible();
    await expect(includedContext).toContainText("Insufficient current data");
    await expect(includedContext).toContainText("Cognitive workload pressure");
    await expect(includedContext).toContainText("Health");
    await expect(includedContext).toContainText("Unknown");
    await expect(includedContext).toContainText("Out of date");
    await expect(includedContext).toContainText("No matching data");
    await expect(includedContext).toContainText("40% coverage");
    await expect(includedContext).toContainText("Staffing baseline unavailable.");
    await expect(includedContext).toContainText("Attribution coverage unavailable.");
    await expect(includedContext).toContainText("Evidence: Cognitive load");
    await expect(includedContext).toContainText("Metrics");
    await expect(includedContext).toContainText("Measured value available");
    await expect(includedContext).toContainText("Status");
    await expect(includedContext).toContainText("Coverage unknown");
}

test.beforeEach(async ({ request }) => {
    await resetAskDevMock(request);
});

test("graph assistance uses one shared answer and evidence path across both surfaces", async ({
    page,
    request,
}, testInfo) => {
    const visibleQuestion = "Which teams need attention, and why?";
    await page.route("**/api/v1/dev/conversations/*/messages", async (route) => {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        await route.continue({
            postData: JSON.stringify({
                ...body,
                question: scenarioQuestion("graph_assisted", visibleQuestion),
            }),
        });
    });
    await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
    await openAskDevWindow(page);
    await submitAskDevQuestion(page, visibleQuestion);

    const windowAnswer = askDevAnswerArticle(page);
    await expect(windowAnswer).toBeVisible();
    await expect(windowAnswer).toContainText("Additional evidence context");
    await expect(windowAnswer).toContainText("Partial context");
    await expect(windowAnswer).toContainText("Platform");
    await expect(windowAnswer).not.toContainText("contribution");
    await expect(windowAnswer).toContainText("The evidence path is partial.");
    await expectRichCohortFacts(windowAnswer);

    const answerId = await windowAnswer.getAttribute("id");
    expect(answerId).toMatch(/^ask-dev-answer-/u);
    const windowText = normalizeAnswerText(await windowAnswer.innerText());
    const beforeNavigation = await getAskDevRequestCounts(request);
    expect(beforeNavigation.messages).toBe(1);

    for (const term of INTERNAL_TERMS) {
        expect(await askDevTranscript(page).innerText()).not.toContain(term);
    }

    await page.getByRole("link", { name: "Ask Dev workspace" }).click();
    await expect(page).toHaveURL(/\/dev(?:\?|$)/u);
    await expect(page.getByRole("region", { name: "Ask Dev workspace" })).toBeVisible();

    const workspaceAnswer = askDevAnswerArticle(page);
    await expect(workspaceAnswer).toBeVisible();
    expect(await workspaceAnswer.getAttribute("id")).toBe(answerId);
    expect(normalizeAnswerText(await workspaceAnswer.innerText())).toBe(windowText);
    expect(await getAskDevRequestCounts(request)).toEqual(beforeNavigation);
    await expectRichCohortFacts(workspaceAnswer);

    const graphRegion = workspaceAnswer.getByRole("region", {
        name: "Additional evidence context",
    });
    await graphRegion
        .getByRole("heading", { name: "Additional evidence context" })
        .scrollIntoViewIfNeeded();
    await graphRegion
        .getByRole("region", { name: "Included context" })
        .getByLabel("Rank 1")
        .scrollIntoViewIfNeeded();
    await testInfo.attach("chaos-3710-graph-assistance-after.png", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
    });
    await graphRegion.getByText("Evidence: Cognitive load").scrollIntoViewIfNeeded();
    await testInfo.attach("chaos-3669-cohort-rendering-after.png", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
    });
    await graphRegion.getByText("The evidence path is partial.").scrollIntoViewIfNeeded();
    await testInfo.attach("chaos-3710-graph-assistance-limitations-after.png", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
    });

    for (const term of INTERNAL_TERMS) {
        expect(await askDevTranscript(page).innerText()).not.toContain(term);
    }

    await testInfo.attach("chaos-3710-graph-assistance-evidence-after.png", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
    });
});
