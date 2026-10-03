import { expect, test } from "@playwright/test";

// ── Flow page layout (CHAOS-8066) ─────────────────────────────────────────────
// The /metrics page in the approved prototype layout: per-tab subtitle, the tile
// strip with one column per tile (4 / 4 / 3), the quadrant card with its
// "Metric evidence" action, and two association cards with an "Evidence" button.
// These checks name layout parts only; they do not depend on the sample values.

const TABS = [
    { tab: "dora", subtitle: "Release speed and stability.", tiles: 4, metric: "deploy_freq" },
    { tab: "flow", subtitle: "From idea to merge.", tiles: 4, metric: "cycle_time" },
    { tab: "throughput", subtitle: "Delivery volume and pacing.", tiles: 3, metric: "throughput" },
] as const;

test.describe("Flow page layout (CHAOS-8066)", () => {
    for (const { tab, subtitle, tiles, metric } of TABS) {
        test(`${tab}: subtitle, ${tiles} tiles in ${tiles} columns, quadrant action`, async ({
            page,
        }) => {
            await page.goto(`/metrics?tab=${tab}`, { waitUntil: "domcontentloaded" });

            const header = page.getByTestId("page-header");
            await expect(header.getByRole("heading", { level: 1, name: "Flow" })).toBeVisible();
            await expect(header).toContainText(subtitle);
            await expect(page.getByText("Open a metric to investigate.")).toHaveCount(0);

            const strip = page.getByTestId("metric-tile-strip");
            await expect(strip).toHaveAttribute("data-columns", String(tiles));
            await expect(strip.locator(":scope > article")).toHaveCount(tiles);

            const action = page
                .getByTestId("quadrant-panel")
                .getByRole("link", { name: "Metric evidence" });
            await expect(action).toHaveAttribute(
                "href",
                new RegExp(`/explore\\?.*metric=${metric}`),
            );
        });
    }

    test("association cards have an Evidence button that opens the shared drawer; no Summary table", async ({
        page,
    }) => {
        await page.goto("/metrics?tab=flow", { waitUntil: "domcontentloaded" });

        const cards = page.getByTestId("association-cards");
        await expect(cards.getByRole("heading", { name: "Likely associations" })).toBeVisible();
        await expect(cards.getByRole("heading", { name: "Primary contributors" })).toBeVisible();
        await expect(cards.getByRole("link")).toHaveCount(0);
        await expect(page.getByRole("table")).toHaveCount(0);

        await expect(page.getByRole("dialog")).toHaveCount(0);
        await cards.getByRole("button", { name: "Evidence: Likely associations" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
    });
});
