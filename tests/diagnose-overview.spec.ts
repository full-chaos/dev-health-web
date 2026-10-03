import { expect, test } from "@playwright/test";

// ── Diagnose Overview hub cards render in test mode (CHAOS-2223) ─────────────
// Complexity, Landscape (bus factor), and Cognitive Load previously short-
// circuited to undefined/null in DEV_HEALTH_TEST_MODE, so these cards could
// only ever render the honest-empty "Not yet connected" tier under Playwright.
// SAMPLE_DIAGNOSE_* constants now flow through the real derivation instead
// (src/lib/areaSignals/diagnose-sample-data.ts).

test.describe("Diagnose Overview hub cards (CHAOS-2223)", () => {
    test("Complexity, Landscape, and Cognitive Load render populated signal values in test mode", async ({
        page,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("area-overview")).toBeVisible();

        const card = (id: string) => page.locator(`[data-signal-id="${id}"]`);

        await expect(card("complexity")).toHaveAttribute("data-state", "medium");
        await expect(card("complexity").getByTestId("area-signal-value")).toHaveText("22");

        await expect(card("landscape")).toHaveAttribute("data-state", "high");
        await expect(card("landscape").getByTestId("area-signal-value")).toHaveText("1.8");

        await expect(card("cognitive-load")).toHaveAttribute("data-state", "low");
        await expect(card("cognitive-load").getByTestId("area-signal-value")).toHaveText("6");
    });

    // Approved prototype layout (CHAOS-8065): the header action, no legacy line above the hero,
    // and the three question buttons in one section card.
    test("header has View evidence, and the question section has the three prototype buttons", async ({
        page,
    }) => {
        await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("area-overview")).toBeVisible();

        await expect(page.getByText("Diagnostic sub-areas, ordered by severity.")).toHaveCount(0);
        await expect(page.getByTestId("page-header")).not.toContainText("durable area");

        const questions = page.getByTestId("diagnose-questions");
        await expect(
            questions.getByRole("heading", { name: "Follow a question into evidence" }),
        ).toBeVisible();
        await expect(questions.getByRole("link")).toHaveText([
            "Explore the work graph",
            "Inspect review latency",
            "Trace effort allocation",
        ]);

        await page
            .getByTestId("page-header-actions")
            .getByRole("button", { name: "View evidence" })
            .click();
        await expect(page.getByRole("dialog")).toBeVisible();
    });
});
