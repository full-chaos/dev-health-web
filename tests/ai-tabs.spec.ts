import { expect, test } from "@playwright/test";

const aiTabs = [
  { name: "Impact", path: "/ai" },
  { name: "Attribution", path: "/ai/attribution" },
  { name: "Review Load", path: "/ai/review-load" },
  { name: "Test Gaps", path: "/ai/test-gaps" },
  { name: "Governance Risk", path: "/ai/risk" },
  { name: "Evidence", path: "/ai/evidence" },
  { name: "Automations", path: "/ai/automations" },
] as const;

test.describe("AI Workflows tabs", () => {
  test("/ai defaults to the Impact tab", async ({ page }) => {
    await page.goto("/ai");

    await expect(page).toHaveURL(/\/ai(?:[?#].*)?$/);
    await expect(page.getByRole("heading", { level: 2, name: "Impact" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Impact$/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("each AI tab renders a distinct heading and distinct content", async ({ page }) => {
    const rendered = new Map<string, string>();

    for (const tab of aiTabs) {
      await page.goto(tab.path);
      await expect(page.getByRole("heading", { level: 2, name: tab.name })).toBeVisible();
      const mainText = await page.locator("main").innerText();
      expect(mainText, `${tab.name} should include its heading`).toContain(tab.name);
      rendered.set(tab.name, mainText.replace(/\s+/g, " ").trim());
    }

    expect(new Set(rendered.values()).size).toBe(rendered.size);
  });
});
