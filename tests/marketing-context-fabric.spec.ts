import { expect, test } from "@playwright/test";

test.describe("Context Fabric marketing page", () => {
    test("renders the product story and both supported experiences", async ({ page }) => {
        await page.goto("/marketing/context-fabric");

        await expect(
            page.getByRole("heading", {
                name: /know what is actually happening—not just what the tracker says/i,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", {
                name: /the ticket says “in progress.” what is the actual state/i,
            }),
        ).toBeVisible();
        await expect(page.getByText("Implemented, deployed, and available")).toBeVisible();
        await expect(page.getByRole("heading", { name: "Ask Dev" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "MCP for agents" })).toBeVisible();
    });

    test("exposes the page from the marketing hub and footer", async ({ page }) => {
        await page.goto("/marketing");

        const hubLink = page.getByRole("link", { name: /context fabric/i }).first();
        await expect(hubLink).toHaveAttribute("href", "/marketing/context-fabric");

        const footerLink = page.locator("footer").getByRole("link", { name: "Context Fabric" });
        await expect(footerLink).toHaveAttribute("href", "/marketing/context-fabric");
    });

    test("keeps public calls to action on supported destinations", async ({ page }) => {
        await page.goto("/marketing/context-fabric");

        await expect(page.getByRole("link", { name: "Get started" }).first()).toHaveAttribute(
            "href",
            "/auth/signup",
        );
        await expect(page.getByRole("link", { name: "View guide" }).last()).toHaveAttribute(
            "href",
            "https://github.com/full-chaos/dev-health-acr/blob/main/docs/mcp-sidecar.md",
        );
    });
});
