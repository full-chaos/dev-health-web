import { expect, test } from "@playwright/test";

import {
    askDevAnswerArticle,
    openAskDevWindow,
    resetAskDevMock,
    scenarioQuestion,
    submitAskDevQuestion,
} from "./helpers/askDev";

/**
 * Beta feedback, asserted on the WIRE.
 *
 * The unit tests around `FeedbackFooter` assert what the component hands its
 * caller. That is necessary but not sufficient: the value that matters is what
 * actually leaves the browser and lands in the corpus, and between the two sit
 * the container, the provider, the API client and the Next proxy. The defect
 * this replaced lived in the provider, not the component — the footer of the day
 * was innocent and the payload was still wrong.
 *
 * So these read the intercepted POST body. The mock deliberately cannot serve as
 * the oracle here: `submitFeedback` in devScenario.ts echoes whatever `reasons`
 * it receives, so asserting the response would be asserting our own input.
 */

type FeedbackBody = {
    rating: string;
    reasons: string[];
    comment: string | null;
};

const FEEDBACK_ROUTE = "**/api/v1/dev/answers/*/feedback";

/** Capture every feedback POST body, letting the request proceed untouched. */
async function captureFeedbackBodies(
    page: import("@playwright/test").Page,
): Promise<readonly FeedbackBody[]> {
    const bodies: FeedbackBody[] = [];
    await page.route(FEEDBACK_ROUTE, async (route) => {
        const raw = route.request().postData();
        if (raw) bodies.push(JSON.parse(raw) as FeedbackBody);
        await route.continue();
    });
    return bodies;
}

async function renderAnswer(page: import("@playwright/test").Page): Promise<void> {
    // The launcher only exists inside the authenticated shell — the persistent
    // window is mounted by app/(app)/layout.tsx, not by the bare page.
    await page.goto("/diagnose", { waitUntil: "domcontentloaded" });
    await openAskDevWindow(page);
    await submitAskDevQuestion(page, scenarioQuestion("complete", "What changed this week?"));
    await expect(askDevAnswerArticle(page)).toBeVisible();
}

test.beforeEach(async ({ request }) => {
    await resetAskDevMock(request);
});

test.describe("Ask Dev — beta feedback reaches the wire as expressed", () => {
    test("a helpful rating sends one reason that restates the button, and no comment", async ({
        page,
    }) => {
        const bodies = await captureFeedbackBodies(page);
        await renderAnswer(page);

        await page.getByRole("button", { name: "Helpful", exact: true }).click();
        await expect(page.getByRole("status").filter({ hasText: "Feedback saved." })).toBeVisible();

        expect(bodies).toHaveLength(1);
        expect(bodies[0]!.rating).toBe("helpful");
        expect(bodies[0]!.reasons).toEqual(["useful"]);
        expect(bodies[0]!.comment ?? null).toBeNull();
    });

    test("an unhelpful rating sends NOTHING until a reason is chosen", async ({ page }) => {
        const bodies = await captureFeedbackBodies(page);
        await renderAnswer(page);

        await page.getByRole("button", { name: "Not helpful" }).click();
        // The reason panel is open and the rating is NOT yet recorded. This is
        // the anti-fabrication invariant at the transport layer: no request has
        // left the browser, so no phantom diagnosis can have been stored.
        await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
        expect(bodies).toHaveLength(0);
    });

    test("an unhelpful rating sends exactly the chosen reasons and the typed comment", async ({
        page,
    }) => {
        const bodies = await captureFeedbackBodies(page);
        await renderAnswer(page);

        await page.getByRole("button", { name: "Not helpful" }).click();
        await page.getByRole("button", { name: "Missing evidence" }).click();
        await page.getByRole("button", { name: "Stale data" }).click();
        await page
            .getByRole("textbox", { name: "Anything else?" })
            .fill("  the numbers are from last month  ");
        await page.getByRole("button", { name: "Save" }).click();
        await expect(page.getByRole("status").filter({ hasText: "Feedback saved." })).toBeVisible();

        expect(bodies).toHaveLength(1);
        const body = bodies[0]!;
        expect(body.rating).toBe("not_helpful");
        expect(body.reasons.slice().sort()).toEqual(["missing_evidence", "stale_data"]);
        // The regression that made this spec exist: every unhelpful rating used
        // to carry "unclear", chosen by nobody.
        expect(body.reasons).not.toContain("unclear");
        expect(body.comment).toBe("the numbers are from last month");
    });

    test("cancelling an unhelpful rating records nothing at all", async ({ page }) => {
        const bodies = await captureFeedbackBodies(page);
        await renderAnswer(page);

        await page.getByRole("button", { name: "Not helpful" }).click();
        await page.getByRole("button", { name: "Incorrect" }).click();
        await page.getByRole("button", { name: "Cancel" }).click();

        await expect(page.getByRole("button", { name: "Save" })).toBeHidden();
        expect(bodies).toHaveLength(0);
    });

    test("the reason chips are keyboard reachable and expose their pressed state", async ({
        page,
    }) => {
        await renderAnswer(page);
        await page.getByRole("button", { name: "Not helpful" }).click();

        const chip = page.getByRole("button", { name: "Unclear" });
        await chip.focus();
        await expect(chip).toBeFocused();
        await expect(chip).toHaveAttribute("aria-pressed", "false");
        await page.keyboard.press("Enter");
        await expect(chip).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
    });
});
