import { expect, test } from "@playwright/test";

test.describe("Context Fabric marketing pages", () => {
    test("renders the ecosystem-wide product story and both supported experiences", async ({
        page,
    }) => {
        await page.goto("/marketing/context-fabric");

        await expect(
            page.getByRole("heading", {
                name: /give people and agents the context behind the work/i,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", {
                name: /understand the engineering ecosystem around the work/i,
            }),
        ).toBeVisible();
        await expect(page.getByRole("heading", { name: "Who" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "What" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Why" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "How" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Ask Dev" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "ACR and MCP" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Explore use cases" }).first()).toHaveAttribute(
            "href",
            "/marketing/context-fabric/use-cases",
        );
    });

    test("keeps project status as one use case and covers broader people and agent questions", async ({
        page,
    }) => {
        await page.goto("/marketing/context-fabric/use-cases");

        await expect(
            page.getByRole("heading", {
                name: /understand the whole context behind an engineering decision/i,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", {
                name: /the ticket says “in progress.” what is the actual state/i,
            }),
        ).toBeVisible();
        await expect(page.getByText("Implemented, deployed, and available")).toBeVisible();
        await expect(
            page.getByRole("heading", {
                name: /know what is complete, blocked, ready, or still uncertain/i,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", {
                name: /find teams that may need attention without ranking people/i,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", {
                name: /prioritize evidence-backed gaps across the delivery system/i,
            }),
        ).toBeVisible();
        await expect(
            page.getByRole("heading", {
                name: /bring the surrounding context to the agent before it works/i,
            }),
        ).toBeVisible();
    });

    test("exposes the landing page from the marketing hub and footer", async ({ page }) => {
        await page.goto("/marketing");

        const hubLink = page.getByRole("link", { name: /context fabric/i }).first();
        await expect(hubLink).toHaveAttribute("href", "/marketing/context-fabric");

        const footerLink = page.locator("footer").getByRole("link", { name: "Context Fabric" });
        await expect(footerLink).toHaveAttribute("href", "/marketing/context-fabric");
    });

    test("keeps public calls to action on supported destinations", async ({ page }) => {
        await page.goto("/marketing/context-fabric/use-cases");

        await expect(page.getByRole("link", { name: "Get started" }).first()).toHaveAttribute(
            "href",
            "/auth/signup",
        );
        await expect(page.getByRole("link", { name: "Configure ACR and MCP" })).toHaveAttribute(
            "href",
            "https://github.com/full-chaos/dev-health-acr/blob/main/docs/mcp-sidecar.md",
        );
        await expect(page.getByRole("link", { name: "Context Fabric overview" })).toHaveAttribute(
            "href",
            "/marketing/context-fabric",
        );
    });
});
